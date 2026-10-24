import test from "node:test";
import assert from "node:assert/strict";
import {validatePullBatch} from "../lib/platform/bidirectional-sync-wire-contract.mjs";
const tenantId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",branchId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",eventId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const request={tenantId,branchId,after:0,limit:10};
const event={id:1,event_id:eventId,tenant_id:tenantId.toUpperCase(),branch_id:branchId.toUpperCase(),payload_digest:"a".repeat(64)};
const batch={ok:true,tenantId:tenantId.toUpperCase(),branchId:branchId.toUpperCase(),nextCursor:1,events:[event]};
test("case-only outer pull scope accepts valid MariaDB UUID identity without rewriting events",()=>{
 assert.deepEqual(validatePullBatch(batch,request),{events:[event],candidateCursor:1});
});
test("foreign or malformed pull batch scope remains forbidden",()=>{
 for(const patch of [{tenantId:eventId},{branchId:eventId},{tenantId:"not-a-uuid"},{branchId:null}])
  assert.throws(()=>validatePullBatch({...batch,...patch},request),/SYNC_BATCH_SCOPE_MISMATCH/);
});
