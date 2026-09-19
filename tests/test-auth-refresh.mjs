#!/usr/bin/env node
/**
 * Integration test for WHOOP OAuth token lifecycle.
 *
 * Guards the defect found 2026-09-18: `getAuthorizationUrl()` omitted the `offline` scope, so
 * WHOOP never issued a refresh token, every access token died after ~1h, and a human had to
 * re-authorize by hand before any data pull. The `refreshToken()` method existed but nothing
 * ever called it, and no token state was persisted.
 *
 * This hits the LIVE WHOOP API and needs a valid refresh token already in the store, so it is
 * not a unit test and does not belong in a pre-commit hook. Run it after touching anything in
 * the auth path:
 *
 *     npm run build && node tests/test-auth-refresh.mjs
 *
 * Requires .env with WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET / WHOOP_REDIRECT_URI and a
 * whoop-tokens.json holding a refresh token. If the refresh token is revoked, re-authorize
 * once and re-run.
 */
import fs from 'fs';
import dotenv from 'dotenv';
import { WhoopApiClient } from '../dist/whoop-api.js';

dotenv.config();

const cfg = () => ({
  clientId: process.env.WHOOP_CLIENT_ID,
  clientSecret: process.env.WHOOP_CLIENT_SECRET,
  redirectUri: process.env.WHOOP_REDIRECT_URI,
});

let pass = 0;
let fail = 0;
const t = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  ok ? pass++ : fail++;
};

const STORE = new URL('../whoop-tokens.json', import.meta.url);
const readStore = () => JSON.parse(fs.readFileSync(STORE, 'utf8'));

// --- 0: the authorization URL must request `offline` ---------------------------------------
console.log('TEST 0: authorization URL requests the offline scope');
{
  const url = new WhoopApiClient(cfg()).getAuthorizationUrl('teststate123');
  const scope = new URL(url).searchParams.get('scope') || '';
  t('scope includes offline', scope.split(/\s+/).includes('offline'), scope);
  t('scope retains all six read scopes', (scope.match(/read:/g) || []).length === 6);
  t('state is echoed', new URL(url).searchParams.get('state') === 'teststate123');
}

// --- A: explicit refresh rotates and persists ----------------------------------------------
console.log('TEST A: refreshToken() with no argument uses the stored token');
{
  const c = new WhoopApiClient(cfg());
  t('canAutoRefresh() true when a store exists', c.canAutoRefresh());
  const before = readStore();
  const r = await c.refreshToken();
  const after = readStore();
  t('returns an access_token', Boolean(r.access_token));
  t('access token rotated', before.accessToken !== after.accessToken);
  t('refresh token persisted', Boolean(after.refreshToken));
  t(
    'expiresAt persisted as epoch ms',
    typeof after.expiresAt === 'number' && after.expiresAt > Date.now(),
    after.expiresAt ? new Date(after.expiresAt).toISOString() : ''
  );
  t('refreshed client can call the API', Boolean((await c.getUserProfile()).user_id));
}

// --- B: a 401 is recovered transparently ---------------------------------------------------
// The store written before this fix had no expiresAt, so the proactive path cannot fire and
// the response interceptor is the only thing standing between the user and a manual re-auth.
console.log('TEST B: 401 auto-recovery with a corrupted access token');
{
  const c = new WhoopApiClient(cfg());
  c.setAccessToken('deliberately-invalid-token');
  try {
    const p = await c.getUserProfile();
    t('401 transparently recovered', Boolean(p.user_id), 'user ' + p.user_id);
  } catch (e) {
    t('401 transparently recovered', false, String(e.response?.status || e.message));
  }
}

// --- C: absent refresh token fails loudly, with the recipe ---------------------------------
console.log('TEST C: no refresh token available');
{
  const empty = { ...cfg(), tokenStorePath: './_nonexistent_store.json' };
  t('canAutoRefresh() false', new WhoopApiClient(empty).canAutoRefresh() === false);
  try {
    await new WhoopApiClient(empty).refreshToken();
    t('throws rather than hanging or returning empty', false, 'no throw');
  } catch (e) {
    t('throws and names the offline scope', /offline/.test(e.message), e.message.slice(0, 60));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
