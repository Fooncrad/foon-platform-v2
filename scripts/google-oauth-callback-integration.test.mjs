import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = readFileSync(new URL('../app/api/auth/google/callback/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const policy = require('../lib/auth/google-oauth-security.mjs');
const state = 'A'.repeat(43);

function setup({ linked = null, matched = null, suppliedState = state, googleVerified = 'true' } = {}) {
  const actions = { sql: [], cookieWrites: [], sessions: [], commits: 0, rollbacks: 0, connections: 0 };
  const jar = {
    get: () => ({ value: state }),
    set: (...args) => actions.cookieWrites.push(args),
  };
  const db = {
    async beginTransaction() {},
    async commit() { actions.commits++; },
    async rollback() { actions.rollbacks++; },
    release() {},
    async execute(sql, args) {
      actions.sql.push({ sql, args });
      if (sql.includes('FROM auth_google_identities')) return [[linked ? { user_id: linked.id } : null].filter(Boolean)];
      if (sql.includes('FROM users WHERE id=')) return [[linked].filter(Boolean)];
      if (sql.includes('FROM users WHERE email=')) return [[matched].filter(Boolean)];
      return [{ affectedRows: 1 }];
    },
  };
  const dependencies = {
    'node:crypto': require('node:crypto'),
    'next/headers': { cookies: async () => jar },
    'next/server': { NextResponse: { redirect: (url) => ({ url: String(url) }) } },
    '@/lib/db/mysql': { database: () => ({ getConnection: async () => { actions.connections++; return db; } }) },
    '@/lib/auth/password': { hashPassword: async () => 'test-only-hash' },
    '@/lib/auth/session': { createSession: async (id) => actions.sessions.push(id) },
    '@/lib/auth/google-oauth-security.mjs': policy,
  };
  const context = {
    exports: {},
    require: (name) => { if (!(name in dependencies)) throw Error('Unexpected import: ' + name); return dependencies[name]; },
    process: { env: { GOOGLE_CLIENT_ID: 'test-client', GOOGLE_CLIENT_SECRET: 'test-secret', APP_URL: 'https://example.test', NODE_ENV: 'test' } },
    URL, URLSearchParams, Buffer,
    fetch: async (url) => ({ ok: true, json: async () => String(url).includes('tokeninfo')
      ? { aud: 'test-client', iss: 'https://accounts.google.com', sub: 'google-sub', email: 'user@example.test', email_verified: googleVerified, name: 'Test User' }
      : { id_token: 'test-token' } }),
  };
  vm.runInNewContext(compiled, context, { filename: 'callback-transpiled.cjs' });
  const request = new Request('https://example.test/api/auth/google/callback?code=abc&state=' + encodeURIComponent(suppliedState));
  return { actions, run: () => context.exports.GET(request) };
}

test('rejects invalid OAuth state before database access and clears cookie with original path', async () => {
  const { run, actions } = setup({ suppliedState: 'B'.repeat(43) });
  const response = await run();
  assert.match(response.url, /GOOGLE_STATE_INVALID/);
  assert.equal(actions.connections, 0);
  assert.equal(actions.cookieWrites[0][2].path, '/api/auth/google');
  assert.equal(actions.cookieWrites[0][2].maxAge, 0);
});

test('blocks linked Google identity when local user email is unverified', async () => {
  const { run, actions } = setup({ linked: { id: 'user-1', status: 'active', email_verified_at: null } });
  assert.match((await run()).url, /GOOGLE_ACCOUNT_DISABLED/);
  assert.equal(actions.sessions.length, 0);
  assert.equal(actions.commits, 0);
  assert.ok(actions.rollbacks >= 1);
});

test('blocks automatic email linking to an unverified local account', async () => {
  const { run, actions } = setup({ matched: { id: 'user-2', status: 'active', email_verified_at: null } });
  assert.match((await run()).url, /GOOGLE_ACCOUNT_DISABLED/);
  assert.equal(actions.sessions.length, 0);
  assert.equal(actions.sql.some(x => x.sql.startsWith('INSERT INTO auth_google_identities')), false);
});

test('blocks inactive matched user even with verified email', async () => {
  const { run, actions } = setup({ matched: { id: 'user-3', status: 'suspended', email_verified_at: '2026-10-24' } });
  assert.match((await run()).url, /GOOGLE_ACCOUNT_DISABLED/);
  assert.equal(actions.sessions.length, 0);
});

test('links existing active verified account and creates only its own session', async () => {
  const { run, actions } = setup({ matched: { id: 'user-4', status: 'active', email_verified_at: '2026-10-24' } });
  assert.equal((await run()).url, 'https://example.test/account');
  assert.deepEqual(actions.sessions, ['user-4']);
  assert.equal(actions.commits, 1);
  assert.equal(actions.sql.filter(x => x.sql.startsWith('INSERT INTO auth_google_identities')).length, 1);
});

test('creates verified local user only after Google token verification', async () => {
  const { run, actions } = setup();
  assert.equal((await run()).url, 'https://example.test/account');
  const insert = actions.sql.find(x => x.sql.startsWith('INSERT INTO users'));
  assert.ok(insert);
  assert.match(insert.sql, /email_verified_at\) VALUES \(\?,\?,\?,\?,\?,NOW\(\)\)/);
  assert.equal(actions.commits, 1);
  assert.equal(actions.sessions.length, 1);
});

test('rejects Google identity with unverified email before database access', async () => {
  const { run, actions } = setup({ googleVerified: 'false' });
  assert.match((await run()).url, /GOOGLE_AUTH_FAILED/);
  assert.equal(actions.connections, 0);
});

test('linked verified Google identity may sign in without new identity insert', async () => {
  const { run, actions } = setup({ linked: { id: 'user-5', status: 'active', email_verified_at: '2026-10-24' } });
  assert.equal((await run()).url, 'https://example.test/account');
  assert.deepEqual(actions.sessions, ['user-5']);
  assert.equal(actions.sql.some(x => x.sql.startsWith('INSERT INTO auth_google_identities')), false);
});
