// Pure bidirectional change-envelope contract. No network calls or database writes.
// A versioned journal is necessary before adding typed table adapters.
import {createHash} from "node:crypto";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sameUuid=(a,b)=>typeof a==="string"&&typeof b==="string"&&uuid.test(a)&&uuid.test(b)&&a.toLowerCase()===b.toLowerCase();
const types=new Set(["catalog_item","catalog_category","catalog_option","media_reference","inventory_movement","order","reservation","waitlist","table","customer_reference","branch_setting","staff_assignment"]);
const operations=new Set(["upsert","delete","movement"]);
// Every transmitted envelope field must be covered by the event digest.
// Reject unknown, hidden or symbol metadata rather than forwarding unsigned data.
const envelopeFields=new Set(["eventId","tenantId","branchId","actorId","entityId","entityType","operation","baseVersion","timestamp","payload"]);
function canonical(value){
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(key=>JSON.stringify(key)+":"+canonical(value[key])).join(",")+"}";
 return JSON.stringify(value);
}
function assertSafePayload(value,depth=0){
 if(depth>32)throw Error("SYNC_INVALID_PAYLOAD");
 if(value===null||typeof value==="string"||typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value))return;
 if(Array.isArray(value)){
  if(Object.getPrototypeOf(value)!==Array.prototype||Reflect.ownKeys(value).length!==value.length+1)throw Error("SYNC_INVALID_PAYLOAD");
  // Reject holes, extra properties, symbols and accessor elements: JSON would
  // omit or transform them without binding the original values to the digest.
  for(let i=0;i<value.length;i++){
   const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
   if(!descriptor||!descriptor.enumerable||!("value" in descriptor))throw Error("SYNC_INVALID_PAYLOAD");
   assertSafePayload(descriptor.value,depth+1);
  }
  return;
 }
 if(typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype){
  for(const key of Reflect.ownKeys(value)){
   if(typeof key!=="string"||["__proto__","constructor","prototype"].includes(key))throw Error("SYNC_INVALID_PAYLOAD");
   const descriptor=Object.getOwnPropertyDescriptor(value,key);
   if(!descriptor||!descriptor.enumerable||!("value" in descriptor))throw Error("SYNC_INVALID_PAYLOAD");
   assertSafePayload(descriptor.value,depth+1);
  }
  return;
 }
 throw Error("SYNC_INVALID_PAYLOAD");
}
export function validateChangeEnvelope(value){
 if(!value||typeof value!=="object"||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Reflect.ownKeys(value).length!==envelopeFields.size||Reflect.ownKeys(value).some(key=>{
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  return typeof key!=="string"||!envelopeFields.has(key)||!descriptor||!descriptor.enumerable||!("value" in descriptor);
 }))throw Error("SYNC_INVALID_ENVELOPE");
 if(["eventId","tenantId","branchId","entityId","actorId"].some(key=>typeof value[key]!=="string"||!uuid.test(value[key])))throw Error("SYNC_INVALID_SCOPE");
 if(!types.has(value.entityType)||!operations.has(value.operation))throw Error("SYNC_UNSUPPORTED_ENTITY");
 if(!Number.isSafeInteger(value.baseVersion)||value.baseVersion<0)throw Error("SYNC_INVALID_VERSION");
 if(typeof value.timestamp!=="string"||!Number.isFinite(Date.parse(value.timestamp)))throw Error("SYNC_INVALID_TIMESTAMP");
 if(!value.payload||typeof value.payload!=="object"||Array.isArray(value.payload))throw Error("SYNC_INVALID_PAYLOAD");
 assertSafePayload(value.payload);
 if(Buffer.byteLength(canonical(value.payload),"utf8")>262144)throw Error("SYNC_INVALID_PAYLOAD");
 if(value.operation==="movement"&&value.entityType!=="inventory_movement")throw Error("SYNC_INVALID_OPERATION");
 if(value.entityType==="inventory_movement"&&value.operation!=="movement")throw Error("SYNC_INVALID_OPERATION");
 return Object.freeze({...value,payload:structuredClone(value.payload)});
}
export function resolveChange({incoming,current,alreadyApplied=false}){
 const change=validateChangeEnvelope(incoming);
 if(alreadyApplied)return {status:"duplicate",eventId:change.eventId};
 if(change.entityType==="inventory_movement"&&(change.baseVersion!==0||!sameUuid(change.entityId,change.eventId)))return {status:"reject",reason:"SYNC_INVALID_MOVEMENT_ID"};
 if(!current)return change.baseVersion===0?{status:"apply",nextVersion:1}:{status:"conflict",reason:"SYNC_MISSING_BASE"};
 if(!sameUuid(current.tenantId,change.tenantId)||!sameUuid(current.branchId,change.branchId)||!sameUuid(current.entityId,change.entityId)||current.entityType!==change.entityType)
  return {status:"reject",reason:"SYNC_SCOPE_MISMATCH"};
 if(!Number.isSafeInteger(current.version)||current.version<0||current.version>=Number.MAX_SAFE_INTEGER)throw Error("SYNC_INVALID_CURRENT_VERSION");
 if(change.entityType==="inventory_movement")return {status:"conflict",reason:"SYNC_MOVEMENT_ALREADY_EXISTS"}; // immutable movement IDs: retries use the same eventId
 return change.baseVersion===current.version?{status:"apply",nextVersion:current.version+1}:{status:"conflict",reason:"SYNC_STALE_VERSION"};
}
export function digestChange(value){
 const change=validateChangeEnvelope(value);
 // Only for event integrity/idempotency, not a cryptographic identity or signature.
 return createHash("sha256").update(JSON.stringify([change.eventId,change.tenantId,change.branchId,change.actorId,change.entityType,change.entityId,change.operation,change.baseVersion,change.timestamp,canonical(change.payload)])).digest("hex");
}
export function validatePullCursor(cursor){
 if(!Number.isSafeInteger(cursor)||cursor<0)throw Error("SYNC_INVALID_CURSOR");
 return cursor;
}
