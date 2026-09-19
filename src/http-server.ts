/**
 * Streamable HTTP transport for the WHOOP MCP server.
 *
 * Exists because a stdio MCP server cannot be always-on or shared over a network: it is a
 * child process spoken to over its own stdin/stdout, with no port and no shared instance.
 * Running one persistent instance reachable over Tailscale requires an HTTP transport.
 *
 * Security posture, deliberate:
 *   - Binds ONLY to the hosts named in WHOOP_MCP_BIND (default 127.0.0.1). Never 0.0.0.0.
 *   - Requires a bearer token for every /mcp request.
 *   - FAILS CLOSED: binding to any non-loopback address without WHOOP_MCP_TOKEN set is
 *     refused at startup. This server exposes personal health data and holds OAuth tokens
 *     that can revoke WHOOP access, so an unauthenticated network listener is never an
 *     acceptable default.
 *
 * Stateless by design: a fresh Server + transport per request, sharing ONE WhoopApiClient so
 * token refresh state is not duplicated. Avoids session leaks in a long-lived process.
 */
import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import { randomUUID, timingSafeEqual } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { WhoopMcpServer } from './mcp-server.js';
import { WhoopApiClient } from './whoop-api.js';
import { WhoopApiConfig } from './types.js';

export interface HttpServeOptions {
  port: number;
  /** Addresses to bind. Loopback-only unless a token is configured. */
  bindHosts: string[];
  /** Bearer token required on /mcp. Mandatory for any non-loopback bind. */
  authToken?: string;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function isLoopback(host: string): boolean {
  return LOOPBACK.has(host);
}

/** Constant-time compare so the token cannot be recovered by timing the response. */
function tokenMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function serveHttp(
  config: WhoopApiConfig,
  opts: HttpServeOptions
): Promise<http.Server[]> {
  const exposesNetwork = opts.bindHosts.some((h) => !isLoopback(h));
  if (exposesNetwork && !opts.authToken) {
    throw new Error(
      'Refusing to start: WHOOP_MCP_BIND includes a non-loopback address ' +
        `(${opts.bindHosts.filter((h) => !isLoopback(h)).join(', ')}) but WHOOP_MCP_TOKEN is not set. ` +
        'This server exposes personal health data and can revoke WHOOP access. ' +
        'Set a token, or bind loopback only.'
    );
  }

  // One client for the process. Per-request Server instances share it so the token store,
  // proactive refresh and in-flight collapsing are process-wide rather than per-request.
  const sharedClient = new WhoopApiClient(config);

  const app = express();
  app.use(express.json({ limit: '4mb' }));

  // Unauthenticated liveness probe, for the service manager. Deliberately leaks nothing.
  app.get('/healthz', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      server: 'whoop-mcp-server',
      transport: 'streamable-http',
      canAutoRefresh: sharedClient.canAutoRefresh(),
    });
  });

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!opts.authToken) return next(); // loopback-only mode, already gated above
    const header = req.headers.authorization || '';
    const provided = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!provided || !tokenMatches(provided, opts.authToken)) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Unauthorized' },
        id: null,
      });
      return;
    }
    next();
  };

  app.post('/mcp', requireAuth, async (req: Request, res: Response) => {
    try {
      const mcp = new WhoopMcpServer(config, sharedClient);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
      });
      // Tie transport teardown to the response so a long-lived process does not accumulate
      // transports for clients that disconnect mid-stream.
      res.on('close', () => {
        transport.close().catch(() => {});
      });
      await mcp.getServer().connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: err instanceof Error ? err.message : String(err) },
          id: null,
        });
      }
    }
  });

  // Streamable HTTP is POST-driven. Answer the other verbs explicitly rather than letting
  // express return a confusing 404 that looks like the server is not running.
  const methodNotAllowed = (_req: Request, res: Response) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Method not allowed. Use POST /mcp.' },
      id: null,
    });
  };
  app.get('/mcp', requireAuth, methodNotAllowed);
  app.delete('/mcp', requireAuth, methodNotAllowed);

  // One http.Server per bind address. express cannot bind a list in a single listen().
  const servers = await Promise.all(
    opts.bindHosts.map(
      (host) =>
        new Promise<http.Server>((resolve, reject) => {
          const srv = http.createServer(app);
          srv.once('error', reject);
          srv.listen(opts.port, host, () => {
            console.error(
              `WHOOP MCP Server listening on http://${host}:${opts.port}/mcp ` +
                `(auth: ${opts.authToken ? 'bearer token' : 'none, loopback only'})`
            );
            resolve(srv);
          });
        })
    )
  );

  return servers;
}

/** Generate a token worth using, for first-time setup. */
export function generateToken(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}
