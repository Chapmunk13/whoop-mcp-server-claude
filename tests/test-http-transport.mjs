#!/usr/bin/env node
/**
 * Streamable HTTP transport test.
 *
 * Starts the server on loopback with a bearer token, then drives it with a real MCP client
 * over HTTP. Covers the security posture as well as the happy path, because the whole point
 * of the HTTP transport is that it is reachable, and a reachable server holding health data
 * and a revoke-access tool has to reject unauthenticated callers.
 *
 *     npm run build && node tests/test-http-transport.mjs
 *
 * Hits the live WHOOP API for the tool-call assertion, so it needs a valid token store.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const PKG = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 3177;
const TOKEN = 'test-token-' + Math.random().toString(36).slice(2);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const t = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const child = spawn(process.execPath, [path.join(PKG, 'whoop-mcp-server.js'), '--http'], {
  cwd: PKG,
  env: {
    ...process.env,
    WHOOP_MCP_PORT: String(PORT),
    WHOOP_MCP_BIND: '127.0.0.1',
    WHOOP_MCP_TOKEN: TOKEN,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => process.env.VERBOSE && process.stderr.write('[srv] ' + d));

const waitForListen = () =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start in 15s')), 15000);
    child.stderr.on('data', (d) => {
      if (d.toString().includes('listening on')) {
        clearTimeout(timer);
        setTimeout(resolve, 150);
      }
    });
    child.on('exit', (c) => { clearTimeout(timer); reject(new Error('server exited ' + c)); });
  });

try {
  await waitForListen();

  // --- health, unauthenticated by design ---------------------------------------------------
  console.log('TEST 1: /healthz is reachable without a token');
  {
    const r = await fetch(`${BASE}/healthz`);
    const j = await r.json();
    t('200 OK', r.status === 200);
    t('reports the streamable-http transport', j.transport === 'streamable-http');
    t('reports refresh capability', typeof j.canAutoRefresh === 'boolean', String(j.canAutoRefresh));
  }

  // --- auth is enforced on /mcp -------------------------------------------------------------
  console.log('TEST 2: /mcp rejects unauthenticated and wrong-token callers');
  {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };

    const noAuth = await fetch(`${BASE}/mcp`, { method: 'POST', headers, body });
    t('401 with no Authorization header', noAuth.status === 401, 'got ' + noAuth.status);

    const badAuth = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { ...headers, Authorization: 'Bearer wrong-token-entirely' },
      body,
    });
    t('401 with a wrong token', badAuth.status === 401, 'got ' + badAuth.status);

    // Same length as the real token, to exercise the constant-time compare path.
    const sameLen = await fetch(`${BASE}/mcp`, {
      method: 'POST',
      headers: { ...headers, Authorization: 'Bearer ' + 'x'.repeat(TOKEN.length) },
      body,
    });
    t('401 with a same-length wrong token', sameLen.status === 401, 'got ' + sameLen.status);
  }

  // --- a real MCP client over HTTP ----------------------------------------------------------
  console.log('TEST 3: a real MCP client completes a session over HTTP');
  {
    const client = new Client({ name: 'http-test', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
    });
    await client.connect(transport);
    t('initialize handshake completed', true);

    const { tools } = await client.listTools();
    t('tools/list returns all 16 tools', tools.length === 16, String(tools.length));
    t('exposes whoop-get-user-profile', tools.some((x) => x.name === 'whoop-get-user-profile'));

    // Live call, which also proves the shared client's token refresh works through HTTP.
    const res = await client.callTool({ name: 'whoop-get-user-profile', arguments: {} });
    const text = res.content?.[0]?.text ?? '';
    t('tool call returns live WHOOP data', /user_id/.test(text) && !res.isError, text.slice(0, 60));

    await client.close();
  }

  // --- non-POST verbs answer clearly --------------------------------------------------------
  console.log('TEST 4: non-POST verbs return 405, not a confusing 404');
  {
    const r = await fetch(`${BASE}/mcp`, { method: 'GET', headers: { Authorization: `Bearer ${TOKEN}` } });
    t('GET /mcp is 405', r.status === 405, 'got ' + r.status);
  }
} catch (err) {
  t('test harness completed', false, String(err.message || err));
} finally {
  child.kill();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
