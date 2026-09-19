#!/usr/bin/env node

// WHOOP MCP Server - standalone executable
//
//   stdio (default):  node whoop-mcp-server.js
//   streamable http:  node whoop-mcp-server.js --http
//
// stdio is for a local MCP client that spawns this process and talks over its stdin/stdout.
// HTTP is for the always-on instance reachable over Tailscale. See src/http-server.ts for
// the security posture: loopback-only unless WHOOP_MCP_TOKEN is set, never 0.0.0.0.
//
// Environment:
//   WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET / WHOOP_REDIRECT_URI   required
//   WHOOP_MCP_PORT     HTTP port, default 3100
//   WHOOP_MCP_BIND     comma-separated bind addresses, default 127.0.0.1
//   WHOOP_MCP_TOKEN    bearer token; REQUIRED for any non-loopback bind
//   WHOOP_TOKEN_STORE  override the token store path

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { WhoopMcpServer } from './dist/mcp-server.js';
import { serveHttp } from './dist/http-server.js';

// Load environment variables from THIS package's .env, not the caller's cwd. An MCP host
// spawns the server from an arbitrary working directory, so a bare dotenv.config() silently
// finds nothing and the server dies on "missing required environment variables".
const __pkgDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__pkgDir, '.env') });

// Validate required environment variables
const requiredEnvVars = ['WHOOP_CLIENT_ID', 'WHOOP_CLIENT_SECRET', 'WHOOP_REDIRECT_URI'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  console.error('Please create a .env file based on env.example');
  process.exit(1);
}

const config = {
  clientId: process.env.WHOOP_CLIENT_ID,
  clientSecret: process.env.WHOOP_CLIENT_SECRET,
  redirectUri: process.env.WHOOP_REDIRECT_URI,
};

const useHttp = process.argv.includes('--http') || process.env.WHOOP_MCP_TRANSPORT === 'http';

if (useHttp) {
  const port = Number(process.env.WHOOP_MCP_PORT || 3100);
  const bindHosts = (process.env.WHOOP_MCP_BIND || '127.0.0.1')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const servers = await serveHttp(config, {
    port,
    bindHosts,
    authToken: process.env.WHOOP_MCP_TOKEN,
  }).catch((error) => {
    console.error('Failed to start WHOOP MCP Server (http):', error.message);
    process.exit(1);
  });

  const shutdown = (signal) => {
    console.error(`Received ${signal}, shutting down.`);
    let remaining = servers.length;
    if (!remaining) process.exit(0);
    for (const s of servers) {
      s.close(() => {
        if (--remaining === 0) process.exit(0);
      });
    }
    // Do not hang forever on a stuck connection; the service manager will restart us.
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} else {
  const server = new WhoopMcpServer(config);
  server.run().catch((error) => {
    console.error('Failed to start WHOOP MCP Server:', error);
    process.exit(1);
  });
}
