import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {enrollSyncDevice,revokeSyncDevice} from "../lib/platform/bidirectional-sync-device-enrollment.mjs";
const adminScope={verifiedServerSide:true,tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",actorId:"33333333-3333-4333-8333-333333333333"};
const authorizeAdmin=async session=>session==="trusted-admin"?adminScope:null;
const session="trusted-admin";
function fixture(){const calls=[];return {calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql,args){calls.push({sql,args});if(sql.startsWith("SELECT attempt_count"))return [[{attempt_count:1}]];return [{affectedRows:1}]}}}
test("only credential SHA256 persisted, raw credential returned once",async()=>{
 const db=fixture();
 const result=await enrollSyncDevice({db,authorizeAdmin,session,grants:["sync.read","catalog.read"],expiresAt:"2027-01-01T00:00:00Z"});
 const insert=db.calls.find(x=>x.sql?.startsWith("INSERT INTO foon_sync_devices"));
 assert.equal(insert.args[4],createHash("sha256").update(result.credential).digest("hex"));
 assert.ok(!JSON.stringify(insert).includes(result.credential));
 assert.equal(db.calls.at(-1),"commit");
});
test("unauthorized enrollment is rejected before any writes",async()=>{
 const db=fixture();
 await assert.rejects(()=>enrollSyncDevice({db,authorizeAdmin:async()=>null,session,grants:["sync.read"],expiresAt:"2027-01-01T00:00:00Z"}),/SYNC_ENROLLMENT_FORBIDDEN/);
 assert.deepEqual(db.calls,[]);
});
test("invalid grant blocks enrollment",async()=>{
 const db=fixture();
 await assert.rejects(()=>enrollSyncDevice({db,authorizeAdmin,session,grants:["admin.all"],expiresAt:"2027-01-01T00:00:00Z"}),/SYNC_INVALID_ENROLLMENT/);
 assert.deepEqual(db.calls,[]);
});
test("revoke is scoped to tenant and branch",async()=>{
 const db=fixture();
 const result=await revokeSyncDevice({db,authorizeAdmin,session,deviceId:"44444444-4444-4444-8444-444444444444"});
 assert.equal(result.status,"revoked");
 const update=db.calls.find(x=>x.sql?.startsWith("UPDATE"));
 assert.deepEqual(update.args,["44444444-4444-4444-8444-444444444444",adminScope.tenantId,adminScope.branchId]);
});

test("forged adminScope without server authenticator never permits enrollment",async()=>{
 const db=fixture();
 await assert.rejects(()=>enrollSyncDevice({db,adminScope,grants:["sync.read"],expiresAt:"2027-01-01T00:00:00Z"}),/SYNC_ADMIN_AUTHENTICATOR_REQUIRED/);
 assert.deepEqual(db.calls,[]);
});
test("revoke rejects unauthorized admin before any DB mutation",async()=>{
 const db=fixture();
 await assert.rejects(()=>revokeSyncDevice({db,authorizeAdmin:async()=>null,session,deviceId:"44444444-4444-4444-8444-444444444444"}),/SYNC_ENROLLMENT_FORBIDDEN/);
 assert.deepEqual(db.calls,[]);
});

test("rate-limited enrollment cannot create a device",async()=>{
 const db=fixture();
 const execute=db.execute.bind(db);
 db.execute=async(sql,args)=>sql.startsWith("SELECT attempt_count")?[[{attempt_count:11}]]:execute(sql,args);
 await assert.rejects(()=>enrollSyncDevice({db,authorizeAdmin,session,grants:["sync.read"],expiresAt:"2027-01-01T00:00:00Z"}),/SYNC_RATE_LIMITED/);
 assert.equal(db.calls.some(x=>x.sql?.startsWith("INSERT INTO foon_sync_devices")),false);
});
test("audit failure rolls back enrollment and never returns credential",async()=>{
 const db=fixture();const execute=db.execute.bind(db);
 db.execute=async(sql,args)=>sql.startsWith("INSERT INTO foon_sync_device_audit")?[{affectedRows:0}]:execute(sql,args);
 await assert.rejects(()=>enrollSyncDevice({db,authorizeAdmin,session,grants:["sync.read"],expiresAt:"2027-01-01T00:00:00Z"}),/SYNC_AUDIT_WRITE_FAILED/);
 assert.equal(db.calls.at(-1),"rollback");
});
