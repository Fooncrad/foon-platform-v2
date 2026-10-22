// Wire-level response validation for a future authenticated two-way sync API.
// Never advance a device cursor or acknowledge its outbox from an arbitrary {ok:true}.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digest=/^[a-f0-9]{64}$/i;
const allowedStatuses=new Set(["recorded","duplicate","conflict"]);
const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);
export function validatePushReceipt(payload,{eventId,tenantId,branchId,digest:expectedDigest}){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||payload.ok!==true)throw Error("SYNC_INVALID_RECEIPT");
 if(!uuid.test(eventId)||!uuid.test(tenantId)||!uuid.test(branchId)||!digest.test(expectedDigest))throw Error("SYNC_INVALID_EXPECTATION");
 const receipt=payload.receipt;
 if(!receipt||typeof receipt!=="object"||Array.isArray(receipt))throw Error("SYNC_INVALID_RECEIPT");
 if(receipt.eventId!==eventId||receipt.tenantId!==tenantId||receipt.branchId!==branchId||receipt.digest!==expectedDigest)throw Error("SYNC_RECEIPT_MISMATCH");
 if(!allowedStatuses.has(receipt.status))throw Error("SYNC_INVALID_RECEIPT");
 if(!Number.isSafeInteger(receipt.nextVersion)||receipt.nextVersion<0)throw Error("SYNC_INVALID_RECEIPT");
 if(receipt.status==="conflict")return {status:"conflict",receipt};
 if((receipt.status==="recorded"||receipt.status==="duplicate")&&receipt.nextVersion===0)throw Error("SYNC_INVALID_RECEIPT");
 // A server claim is NOT cryptographically authenticated: callers must verify
 // a signature/MAC bound to device/event/version BEFORE deleting queued changes.
 return {status:"unverified",receipt};
}
export function validatePullBatch(payload,{tenantId,branchId,after,limit=100}){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||payload.ok!==true)throw Error("SYNC_INVALID_BATCH");
 if(!uuid.test(tenantId)||!uuid.test(branchId)||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error("SYNC_INVALID_EXPECTATION");
 if(payload.tenantId!==tenantId||payload.branchId!==branchId||!Array.isArray(payload.events)||payload.events.length>limit||!Number.isSafeInteger(payload.nextCursor)||payload.nextCursor<after)throw Error("SYNC_BATCH_SCOPE_MISMATCH");
 let prior=after;
 for(const event of payload.events){
  if(!event||typeof event!=="object"||!Number.isSafeInteger(event.id)||event.id<=prior||!uuid.test(event.event_id)||!digest.test(event.payload_digest))throw Error("SYNC_INVALID_BATCH");
  if(event.tenant_id!==tenantId||event.branch_id!==branchId)throw Error("SYNC_BATCH_SCOPE_MISMATCH");
  prior=event.id;
 }
 if(prior>payload.nextCursor)throw Error("SYNC_INVALID_BATCH");
 // Cursor is a candidate only. Persist it AFTER typed adapters commit.
 return {events:payload.events,candidateCursor:payload.nextCursor};
}
