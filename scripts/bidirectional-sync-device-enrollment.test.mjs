import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {enrollSyncDevice,revokeSyncDevice} from "../lib/platform/bidirectional-sync-device-enrollment.mjs";
const adminScope={authorizedAdmin:true,tenantId:"11111111-1111-4111-8111-111111111111",branchId:"22222222-2222-4222-8222-222222222222",actorId:"33333333-3333-4333-8333-333333333333"};
const expiresAt="2099-01-01T00:00:00Z";
function fixture(){const calls=[];return {calls,async beginTransaction(){calls.push("begin")},async commit(){calls.push("commit")},async rollback(){calls.push("rollback")},async execute(sql,args){calls.push({sql,args});return [{affectedRows:1}]}}}
test("only credential SHA256 persisted, raw credential returned once",async()=>{
 const db=fixture();
 const result=await enrollSyncDevice({db,adminScope,grants:["sync.read","catalog.read"],expiresAt:"2027-01-01T00:00:00Z"});
 const insert=db.calls.find(x=>x.sql?.startsWith("INSERT"));
 assert.equal(insert.args[4],createHash("sha256").update(result.credential).digest("hex"));
 assert.ok(!JSON.stringify(insert).includes(result.credential));
 assert.equal(db.calls.at(-1),"commit");
});
test("unauthorized enrollment is rejected before any writes",async()=>{
 const db=fixture();
 await assert.rejects(()=>enrollSyncDevice({db,adminScope:{...adminScope,authorizedAdmin:false},grants:["sync.read"],expiresAt:"2027-01-01T00:00:00Z"}),/SYNC_ENROLLMENT_FORBIDDEN/);
 assert.deepEqual(db.calls,[]);
});
test("invalid grant blocks enrollment",async()=>{
 const db=fixture();
 await assert.rejects(()=>enrollSyncDevice({db,adminScope,grants:["admin.all"],expiresAt:"2027-01-01T00:00:00Z"}),/SYNC_INVALID_ENROLLMENT/);
 assert.deepEqual(db.calls,[]);
});
test("revoke is scoped to tenant and branch",async()=>{
 const db=fixture();
 const result=await revokeSyncDevice({db,adminScope,deviceId:"44444444-4444-4444-8444-444444444444"});
 assert.equal(result.status,"revoked");
 const update=db.calls.find(x=>x.sql?.startsWith("UPDATE"));
 assert.deepEqual(update.args,["44444444-4444-4444-8444-444444444444",adminScope.tenantId,adminScope.branchId]);
});
