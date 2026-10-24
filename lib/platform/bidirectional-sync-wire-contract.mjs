// Wire-level response validation for a future authenticated two-way sync API.
// Never advance a device cursor or acknowledge its outbox from an arbitrary {ok:true}.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sameUuid=(a,b)=>typeof a==="string"&&typeof b==="string"&&uuid.test(a)&&uuid.test(b)&&a.toLowerCase()===b.toLowerCase();
const digest=/^[a-f0-9]{64}$/i;
const allowedStatuses=new Set(["recorded","duplicate","conflict"]);
export function validatePushReceipt(payload,{eventId,tenantId,branchId,digest:expectedDigest}){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||payload.ok!==true)throw Error("SYNC_INVALID_RECEIPT");
 if(!uuid.test(eventId)||!uuid.test(tenantId)||!uuid.test(branchId)||!digest.test(expectedDigest))throw Error("SYNC_INVALID_EXPECTATION");
 const receipt=payload.receipt;
 if(!receipt||typeof receipt!=="object"||Array.isArray(receipt))throw Error("SYNC_INVALID_RECEIPT");
 if(!sameUuid(receipt.eventId,eventId)||!sameUuid(receipt.tenantId,tenantId)||!sameUuid(receipt.branchId,branchId)||receipt.digest!==expectedDigest)throw Error("SYNC_RECEIPT_MISMATCH");
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
 // Header UUIDs are identifiers, not case-sensitive display strings.
 if(!sameUuid(payload.tenantId,tenantId)||!sameUuid(payload.branchId,branchId)||!Array.isArray(payload.events)||payload.events.length>limit||!Number.isSafeInteger(payload.nextCursor)||payload.nextCursor<after)throw Error("SYNC_BATCH_SCOPE_MISMATCH");
 let prior=after;
 // A duplicated journal event under two cursor IDs must never be applied twice
 // (especially inventory movements, orders and reservations).
 const seenEventIds=new Set();
 for(const event of payload.events){
  if(!event||typeof event!=="object"||!Number.isSafeInteger(event.id)||event.id<=prior||!uuid.test(event.event_id)||!digest.test(event.payload_digest))throw Error("SYNC_INVALID_BATCH");
  // UUID identity is case-insensitive in the journal; do not alter signed event bytes.
  if(typeof event.tenant_id!=="string"||typeof event.branch_id!=="string"||event.tenant_id.toLowerCase()!==tenantId.toLowerCase()||event.branch_id.toLowerCase()!==branchId.toLowerCase())throw Error("SYNC_BATCH_SCOPE_MISMATCH");
  // UUID comparisons are case-insensitive; a casing change is still a replay.
  const eventId=event.event_id.toLowerCase();
  if(seenEventIds.has(eventId))throw Error("SYNC_DUPLICATE_PULL_EVENT");
  seenEventIds.add(eventId);
  prior=event.id;
 }
 if(prior>payload.nextCursor)throw Error("SYNC_INVALID_BATCH");
 // Cursor is a candidate only. Persist it AFTER typed adapters commit.
 return {events:payload.events,candidateCursor:payload.nextCursor};
}
