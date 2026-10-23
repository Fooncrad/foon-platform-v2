import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes,createHash} from "node:crypto";
import {authenticateEnrolledSyncDevice} from "../lib/platform/bidirectional-sync-device-auth.mjs";
const ids=["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","33333333-3333-4333-8333-333333333333","44444444-4444-4444-8444-444444444444"];
const credential=ids[0]+"."+randomBytes(32).toString("base64url");
const row={device_id:ids[0],tenant_id:ids[1],branch_id:ids[2],actor_id:ids[3],token_sha256:createHash("sha256").update(credential).digest("hex"),grants_json:JSON.stringify(["sync.read","catalog.write"]),enabled:1,revoked:0,suspended:0,expires_at:"2099-01-01T00:00:00Z"};
const db=(r=row)=>({async execute(sql,args){assert.match(sql,/FROM foon_sync_devices WHERE device_id=/);assert.deepEqual(args,[ids[0]]);return [r?[r]:[]]}});
test("enrolled device is loaded from DB, never user-provided scope",async()=>{
 const out=await authenticateEnrolledSyncDevice(db(),credential);
 assert.equal(out.tenantId,ids[1]);assert.deepEqual(out.grants,["sync.read","catalog.write"]);
});
test("invalid secret never authenticates",async()=>{
 await assert.rejects(()=>authenticateEnrolledSyncDevice(db(),ids[0]+"."+randomBytes(32).toString("base64url")) ,/SYNC_AUTH_REQUIRED/);
});
test("revoked and expired device cannot authenticate",async()=>{
 await assert.rejects(()=>authenticateEnrolledSyncDevice(db({...row,revoked:1}),credential),/SYNC_DEVICE_DISABLED/);
 await assert.rejects(()=>authenticateEnrolledSyncDevice(db({...row,expires_at:"2020-01-01T00:00:00Z"}),credential),/SYNC_DEVICE_EXPIRED/);
});
test("missing enrollment fails closed",async()=>{
 await assert.rejects(()=>authenticateEnrolledSyncDevice(db(null),credential),/SYNC_AUTH_REQUIRED/);
});
