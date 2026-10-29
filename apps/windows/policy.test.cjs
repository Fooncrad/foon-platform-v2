const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {validateConfiguration, isSiteNavigation, serverEnvironment} = require('./policy.cjs');
const {parseEnrollment}=require('./policy.cjs');
test('device enrollment never executes shell input and secrets only enter the trusted child environment',()=>{
  const id='11111111-1111-4111-8111-111111111111';
  const contents=`FOON_EDGE_DEVICE_ID=${id}\nFOON_EDGE_TENANT_ID=${id}\nFOON_EDGE_BRANCH_ID=${id}\nFOON_EDGE_ACTOR_USER_ID=${id}\nFOON_EDGE_ACTOR_ROLE=owner\nFOON_EDGE_CLOUD_DEVICE_TOKEN=${'a'.repeat(96)}\nFOON_EDGE_RECEIPT_SIGNING_KEY=${'b'.repeat(64)}\n`;
  const sync=parseEnrollment(contents,'https://cloud.example/api/edge/sync');
  const config=validateConfiguration({databaseUrl:'mysql://local:secret@localhost/foon',sync});
  assert.equal(JSON.parse(serverEnvironment(config,'site').FOON_DESKTOP_SYNC_CONFIG).deviceId,id);
  assert.throws(()=>parseEnrollment(contents+'NODE_OPTIONS=--require attacker\n',sync.cloudUrl));
  assert.throws(()=>parseEnrollment(contents+'FOON_EDGE_DEVICE_ID='+id,sync.cloudUrl));
  assert.throws(()=>parseEnrollment(contents,'https://127.1/api/edge/sync'));
});
test('only explicit loopback MySQL destinations with credentials are accepted', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) assert.equal(validateConfiguration({databaseUrl: `mysql://local:secret@${host}:3307/foon_local`}).port, 43871);
  for (const value of [
    'mysql://local:secret@db.foon.example/foon', 'mysql://local:secret@127.0.0.1.evil.example/foon',
    'https://local:secret@localhost/foon', 'mysql://local@localhost/foon',
    'mysql://local:secret@localhost/foon?socketPath=remote', 'mysql://local:secret@localhost/'
  ]) assert.throws(() => validateConfiguration({databaseUrl: value}));
  assert.throws(() => validateConfiguration({databaseUrl: 'mysql://a:b@localhost/foon', port: 80}));
  assert.throws(() => validateConfiguration({databaseUrl: 'mysql://a:b@localhost/foon', cloudToken: 'secret'}));
});
test('navigation remains on the owned local website origin', () => {
  const origin = 'http://127.0.0.1:43871';
  assert.ok(isSiteNavigation(origin + '/restaurant?lang=fr', origin));
  for (const value of ['file:///C:/Windows/test', 'javascript:alert(1)', 'https://foon.example', 'http://127.0.0.1:43872', 'http://user@127.0.0.1:43871']) assert.equal(isSiteNavigation(value, origin), false);
});
test('child server never inherits production credentials or Node injection options', () => {
  const previous = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--require attacker.cjs';
  try {
    const env = serverEnvironment({databaseUrl: 'mysql://a:b@localhost/foon_local', port: 43871}, 'site');
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.FOON_EDGE_CLOUD_DEVICE_TOKEN, undefined);
    assert.equal(env.HOSTNAME, '127.0.0.1');
    assert.equal(env.APP_URL, 'http://127.0.0.1:43871');
    assert.equal(env.DATABASE_URL, 'mysql://a:b@localhost/foon_local');
  } finally {if (previous === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = previous;}
});
test('installer retains user data, never publishes, and bundles the original server', () => {
  const pkg = JSON.parse(fs.readFileSync(__dirname + '/package.json'));
  assert.equal(pkg.build.nsis.deleteAppDataOnUninstall, false);
  assert.equal(pkg.build.publish, null);
  assert.ok(pkg.scripts.dist.includes('--publish never'));
  assert.deepEqual(pkg.build.extraResources, [{from: 'staged/site', to: 'site'}]);
});
