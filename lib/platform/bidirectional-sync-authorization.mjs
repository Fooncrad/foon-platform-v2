// Explicit trusted authorization boundary for future push/pull API handlers.
// Never accept this context from an unverified request body; build it only from
// server-verified device enrollment and the current DB role/branch grant.
import {validateChangeEnvelope,validatePullCursor} from "./bidirectional-sync-contract.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const entityPermissions=Object.freeze({
 catalog_item:"catalog.write",catalog_category:"catalog.write",catalog_option:"catalog.write",
 media_reference:"media.write",inventory_movement:"inventory.write",order:"orders.write",
 reservation:"reservations.write",waitlist:"waitlist.write",table:"tables.write",
 customer_reference:"customers.write",branch_setting:"settings.write",
 staff_assignment:"staff.write"
});
// A general sync.read grant permits a feed only; every entity also needs a
// separate read grant. Never send customer/staff payloads to POS-only devices.
const entityReadPermissions=Object.freeze({
 catalog_item:"catalog.read",catalog_category:"catalog.read",catalog_option:"catalog.read",
 media_reference:"media.read",inventory_movement:"inventory.read",order:"orders.read",
 reservation:"reservations.read",waitlist:"waitlist.read",table:"tables.read",
 customer_reference:"customers.read",branch_setting:"settings.read",
 staff_assignment:"staff.read"
});
export function filterAuthorizedSyncEvents(verifiedContext,events){
 const ctx=validateVerifiedDeviceContext(verifiedContext);
 if(!ctx.grants.includes("sync.read"))throw Error("SYNC_READ_FORBIDDEN");
 if(!Array.isArray(events))throw Error("SYNC_INVALID_FEED");
 return events.filter(event=>{
  if(!event||typeof event!=="object")throw Error("SYNC_INVALID_FEED");
  // Validate every journal row BEFORE filtering by read grants. Otherwise an
  // unauthorized cross-branch row could be hidden while its ID still advances
  // the signed cursor, silently skipping legitimate order/stock updates.
  // UUID CHAR scope identity is case-insensitive in MariaDB; preserve the raw row for digest verification.
  if(typeof event.tenant_id!=="string"||typeof event.branch_id!=="string"||event.tenant_id.toLowerCase()!==ctx.tenantId.toLowerCase()||event.branch_id.toLowerCase()!==ctx.branchId.toLowerCase())throw Error("SYNC_FEED_SCOPE_MISMATCH");
  const permission=entityReadPermissions[event.entity_type];
  return Boolean(permission&&ctx.grants.includes(permission));
 });
}
export function validateVerifiedDeviceContext(ctx){
 if(!ctx||typeof ctx!=="object"||Array.isArray(ctx))throw Error("SYNC_AUTH_REQUIRED");
 for(const key of ["deviceId","tenantId","branchId","actorId"])if(!uuid.test(ctx[key]))throw Error("SYNC_AUTH_REQUIRED");
 if(ctx.authenticated!==true||ctx.revoked!==false||ctx.enabled!==true||ctx.suspended!==false)throw Error("SYNC_DEVICE_DISABLED");
 if(typeof ctx.expiresAt!=="string"||!Number.isFinite(Date.parse(ctx.expiresAt))||Date.parse(ctx.expiresAt)<=Date.now())throw Error("SYNC_DEVICE_EXPIRED");
 if(!Array.isArray(ctx.grants)||ctx.grants.some(g=>typeof g!=="string"))throw Error("SYNC_INVALID_GRANTS");
 return ctx;
}
export function authorizeSyncPush(verifiedContext,input){
 const ctx=validateVerifiedDeviceContext(verifiedContext);
 const change=validateChangeEnvelope(input);
 if(change.tenantId!==ctx.tenantId||change.branchId!==ctx.branchId||change.actorId!==ctx.actorId)throw Error("SYNC_SCOPE_FORBIDDEN");
 const permission=entityPermissions[change.entityType];
 if(!permission||!ctx.grants.includes(permission))throw Error("SYNC_WRITE_FORBIDDEN");
 return {change,sourceDeviceId:ctx.deviceId};
}
export function authorizeSyncPull(verifiedContext,{tenantId,branchId,after=0,limit=100}){
 const ctx=validateVerifiedDeviceContext(verifiedContext);
 if(tenantId!==ctx.tenantId||branchId!==ctx.branchId)throw Error("SYNC_SCOPE_FORBIDDEN");
 if(!ctx.grants.includes("sync.read"))throw Error("SYNC_READ_FORBIDDEN");
 validatePullCursor(after);
 if(!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error("SYNC_INVALID_LIMIT");
 return {tenantId,branchId,after,limit};
}
