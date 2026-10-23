import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {authenticateEnrolledSyncDevice} from '../lib/platform/bidirectional-sync-device-auth.mjs';
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444'];
const credential=ids[0]+'.'+randomBytes(32).toString('base64url');
const row={device_id:ids[0],tenant_id:ids[1],branch_id:ids[2],actor_id:ids[3],token_sha256:createHash('sha256').update(credential).digest('hex'),grants_json:JSON.stringify(['sync.read','catalog.write']),enabled:1,revoked:0,suspended:0,expires_at:'2099-01-01T00:00:00Z'};
function db(permitted=true,overrides={},queryFailure=false){
 const calls=[];
 return {calls,async execute(sql,args){calls.push({sql,args});if(calls.length===1){assert.match(sql,/FROM foon_sync_devices WHERE device_id=/);assert.deepEqual(args,[ids[0]]);return [[{...row,...overrides}]];}
 assert.match(sql,/FROM memberships m/);assert.match(sql,/JOIN users u/);assert.match(sql,/JOIN tenants t/);assert.match(sql,/JOIN branches b/);assert.match(sql,/LEFT JOIN platform_admins pa/);
 assert.match(sql,/m\.role IN \('owner','manager'\)/);assert.match(sql,/m\.status='active'/);assert.match(sql,/u\.status='active'/);assert.match(sql,/t\.status='active'/);assert.match(sql,/b\.enabled=TRUE/);assert.match(sql,/pa\.user_id IS NULL/);
 assert.deepEqual(args,[ids[2],ids[3],ids[1]]);if(queryFailure)throw Error('DATABASE_UNAVAILABLE');return [permitted?[{permitted:1}]:[]];}};
}
test('active merchant membership preserves enrolled scope',async()=>{const client=db();const out=await authenticateEnrolledSyncDevice(client,credential);assert.equal(out.tenantId,ids[1]);assert.deepEqual(out.grants,['sync.read','catalog.write']);assert.equal(client.calls.length,2)});
test('revoked or demoted membership fails closed',async()=>{await assert.rejects(()=>authenticateEnrolledSyncDevice(db(false),credential),/SYNC_AUTH_REQUIRED/)});
test('disabled tenant, branch or actor fails closed',async()=>{await assert.rejects(()=>authenticateEnrolledSyncDevice(db(false),credential),/SYNC_AUTH_REQUIRED/)});
test('platform admin overlap fails closed',async()=>{await assert.rejects(()=>authenticateEnrolledSyncDevice(db(false),credential),/SYNC_AUTH_REQUIRED/)});
test('wrong secret never performs membership query',async()=>{const client=db();await assert.rejects(()=>authenticateEnrolledSyncDevice(client,ids[0]+'.'+randomBytes(32).toString('base64url')),/SYNC_AUTH_REQUIRED/);assert.equal(client.calls.length,1)});
test('database failure fails closed',async()=>{await assert.rejects(()=>authenticateEnrolledSyncDevice(db(true,{},true),credential),/DATABASE_UNAVAILABLE/)});
test('revoked device still fails',async()=>{await assert.rejects(()=>authenticateEnrolledSyncDevice(db(true,{revoked:1}),credential),/SYNC_DEVICE_DISABLED/)});
