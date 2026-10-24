import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {parseSyncPullQuery} from '../lib/platform/bidirectional-sync-pull-query.mjs';
import {authenticateEnrolledSyncDevice} from '../lib/platform/bidirectional-sync-device-auth.mjs';
import {authorizeSyncPull} from '../lib/platform/bidirectional-sync-authorization.mjs';

const deviceId='11111111-1111-4111-8111-111111111111';
const tenantId='22222222-2222-4222-8222-222222222222';
const branchId='33333333-3333-4333-8333-333333333333';
const actorId='44444444-4444-4444-8444-444444444444';
const otherId='55555555-5555-4555-8555-555555555555';
const credential=deviceId+'.'+'a'.repeat(43);
const row={device_id:deviceId,tenant_id:tenantId,branch_id:branchId,actor_id:actorId,
 token_sha256:createHash('sha256').update(credential).digest('hex'),enabled:1,revoked:0,
 suspended:0,expires_at:'2099-01-01T00:00:00Z',grants_json:'["sync.read","orders.read"]'};
function connection(permitted=true){
 const calls=[];
 return {calls,async execute(sql){calls.push(sql);
  if(sql.includes('FROM foon_sync_devices'))return [[row]];
  if(sql.includes('FROM memberships'))return [permitted?[{permitted:1}]:[]];
  throw Error('UNEXPECTED_SQL');
 }};
}
async function authorizeRequest(query,db){
 // Mirrors the pure validation/auth order of the cloud route without a Next.js or DB dependency.
 const scope=parseSyncPullQuery(new URLSearchParams(query));
 const ctx=await authenticateEnrolledSyncDevice(db,credential);
 return authorizeSyncPull(ctx,scope);
}
test('invalid and duplicate query fields are rejected before device DB authentication',async()=>{
 for(const query of [
  `tenantId=${tenantId}&tenantId=${otherId}&branchId=${branchId}`,
  `tenantId=${tenantId}&branchId=${branchId}&token=secret`,
  `tenantId=${tenantId}&branchId=${branchId}&after=1e2`
 ]){
  const db=connection();
  await assert.rejects(()=>authorizeRequest(query,db),/SYNC_INVALID_PULL_QUERY/);
  assert.equal(db.calls.length,0);
 }
});
test('live membership revocation denies valid pull query',async()=>{
 const db=connection(false);
 await assert.rejects(()=>authorizeRequest(`tenantId=${tenantId}&branchId=${branchId}`,db),/SYNC_AUTH_REQUIRED/);
 assert.equal(db.calls.length,2);
});
test('cross-tenant and cross-branch requests fail even with valid enrolled device',async()=>{
 for(const query of [`tenantId=${otherId}&branchId=${branchId}`,`tenantId=${tenantId}&branchId=${otherId}`]){
  const db=connection(true);
  await assert.rejects(()=>authorizeRequest(query,db),/SYNC_SCOPE_FORBIDDEN/);
  assert.equal(db.calls.length,2);
 }
});
test('matching tenant/branch with active membership is authorized with strict read scope',async()=>{
 const db=connection(true);
 const out=await authorizeRequest(`tenantId=${tenantId}&branchId=${branchId}&after=0&limit=100`,db);
 assert.deepEqual(out,{tenantId,branchId,after:0,limit:100});
});
test('actual Next.js route validates query before acquiring a database connection',()=>{
 const route=readFileSync(new URL('../app/api/sync/v1/pull/route.ts',import.meta.url),'utf8');
 const parseAt=route.indexOf('parseSyncPullQuery(new URL(request.url).searchParams)');
 const dbAt=route.indexOf('database().getConnection()');
 assert.ok(parseAt>=0&&dbAt>parseAt,'route must reject malformed query before opening DB');
});
