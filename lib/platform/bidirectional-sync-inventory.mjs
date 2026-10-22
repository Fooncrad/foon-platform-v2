import {recordAuthorizedChange} from "./bidirectional-sync-service.mjs";
// Isolated durable inventory projection for future typed adapter integration.
// The project inventory tables are not changed by this module.
export function validateInventoryMovement(change){
 if(!change||change.entityType!=="inventory_movement"||change.operation!=="movement")throw Error("SYNC_INVENTORY_OPERATION_REQUIRED");
 const p=change.payload;
 if(!p||typeof p!=="object"||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i).test(p.itemId))throw Error("SYNC_INVENTORY_ITEM_REQUIRED");
 if(!Number.isSafeInteger(p.delta)||p.delta===0||Math.abs(p.delta)>1000000)throw Error("SYNC_INVENTORY_INVALID_DELTA");
 if(change.entityId!==change.eventId)throw Error("SYNC_INVENTORY_EVENT_ID_MISMATCH");
 return {itemId:p.itemId,delta:p.delta};
}
// This function must run ONLY inside recordAuthorizedChange's owning transaction.
// The event journal's unique event ID deduplicates replay before this adapter executes.
export async function applyScopedInventoryMovement(db,change){
 const {itemId,delta}=validateInventoryMovement(change);
 // Dedicated projection is deliberately isolated from production order stock until
 // physical catalog/branch ownership and unit conversion have been reconciled.
 const [rows]=await db.execute("SELECT quantity FROM foon_sync_inventory_projection WHERE tenant_id=? AND branch_id=? AND item_id=? FOR UPDATE",[change.tenantId,change.branchId,itemId]);
 if(rows.length!==1)throw Error("SYNC_INVENTORY_NOT_PROVISIONED");
 const raw=rows[0].quantity;
 if(typeof raw!=="string"&&typeof raw!=="number"&&typeof raw!=="bigint")throw Error("SYNC_INVENTORY_INVALID_QUANTITY");
 if(!/^(0|[1-9][0-9]*)$/.test(String(raw)))throw Error("SYNC_INVENTORY_INVALID_QUANTITY");
 const current=Number(raw);
 if(!Number.isSafeInteger(current)||current<0||!Number.isSafeInteger(current+delta)||current+delta<0)throw Error("SYNC_INVENTORY_INSUFFICIENT");
 const [updated]=await db.execute("UPDATE foon_sync_inventory_projection SET quantity=? WHERE tenant_id=? AND branch_id=? AND item_id=? AND quantity=?",[current+delta,change.tenantId,change.branchId,itemId,current]);
 if(updated?.affectedRows!==1)throw Error("SYNC_INVENTORY_WRITE_CONFLICT");
 return true;
}

// Trusted opt-in entrypoint, still restricted to the staging-only projection.
// Device context must be created by server-side authentication, never request JSON.
export async function recordAuthorizedInventoryMovement({db,verifiedContext,change}){
 validateInventoryMovement(change);
 return recordAuthorizedChange({db,verifiedContext,change,applyBusinessChange:applyScopedInventoryMovement});
}
