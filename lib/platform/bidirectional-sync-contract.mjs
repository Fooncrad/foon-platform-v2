// Pure bidirectional change-envelope contract. No network calls or database writes.
// A versioned journal is necessary before adding typed table adapters.
import {createHash} from "node:crypto";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const types=new Set(["catalog_item","catalog_category","catalog_option","media_reference","inventory_movement","order","reservation","waitlist","table","customer_reference","branch_setting","staff_assignment"]);
const operations=new Set(["upsert","delete","movement"]);
const canonical=(value)=>JSON.stringify(value,Object.keys(value).sort());
export function validateChangeEnvelope(value){
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("SYNC_INVALID_ENVELOPE");
 if(!uuid.test(value.eventId)||!uuid.test(value.tenantId)||!uuid.test(value.branchId)||!uuid.test(value.entityId)||!uuid.test(value.actorId))throw Error("SYNC_INVALID_SCOPE");
 if(!types.has(value.entityType)||!operations.has(value.operation))throw Error("SYNC_UNSUPPORTED_ENTITY");
 if(!Number.isSafeInteger(value.baseVersion)||value.baseVersion<0)throw Error("SYNC_INVALID_VERSION");
 if(typeof value.timestamp!=="string"||!Number.isFinite(Date.parse(value.timestamp)))throw Error("SYNC_INVALID_TIMESTAMP");
 if(!value.payload||typeof value.payload!=="object"||Array.isArray(value.payload)||Buffer.byteLength(JSON.stringify(value.payload),"utf8")>262144)throw Error("SYNC_INVALID_PAYLOAD");
 if(value.operation==="movement"&&value.entityType!=="inventory_movement")throw Error("SYNC_INVALID_OPERATION");
 if(value.entityType==="inventory_movement"&&value.operation!=="movement")throw Error("SYNC_INVALID_OPERATION");
 return Object.freeze({...value,payload:structuredClone(value.payload)});
}
export function resolveChange({incoming,current,alreadyApplied=false}){
 const change=validateChangeEnvelope(incoming);
 if(alreadyApplied)return {status:"duplicate",eventId:change.eventId};
 if(!current)return change.baseVersion===0?{status:"apply",nextVersion:1}:{status:"conflict",reason:"SYNC_MISSING_BASE"};
 if(current.tenantId!==change.tenantId||current.branchId!==change.branchId||current.entityId!==change.entityId||current.entityType!==change.entityType)
  return {status:"reject",reason:"SYNC_SCOPE_MISMATCH"};
 if(!Number.isSafeInteger(current.version)||current.version<0)throw Error("SYNC_INVALID_CURRENT_VERSION");
 if(change.entityType==="inventory_movement")return {status:"apply",nextVersion:current.version+1}; // movement IDs are independently deduplicated by the persistent journal
 return change.baseVersion===current.version?{status:"apply",nextVersion:current.version+1}:{status:"conflict",reason:"SYNC_STALE_VERSION"};
}
export function digestChange(value){
 const change=validateChangeEnvelope(value);
 // Only for event integrity/idempotency, not a cryptographic identity or signature.
 return createHash("sha256").update(JSON.stringify([change.eventId,change.tenantId,change.branchId,change.entityType,change.entityId,change.operation,change.baseVersion,change.timestamp,change.payload])).digest("hex");
}
export function validatePullCursor(cursor){
 if(!Number.isSafeInteger(cursor)||cursor<0)throw Error("SYNC_INVALID_CURSOR");
 return cursor;
}
