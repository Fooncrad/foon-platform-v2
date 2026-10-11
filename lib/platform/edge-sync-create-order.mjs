import {randomUUID} from "node:crypto";
import {priceEdgeItems} from "./edge-sync-pricing.mjs";
// Must run inside the inbox transaction. Actor comes from authenticated device registration,
// never the event payload. Tax/discount policy must be resolved by trusted server code.
export async function insertPricedEdgeOrder(connection,event,context){
 if(!event||event.kind!=="created"||!event.payload||event.payload.id!==event.orderId)throw Error("EDGE_INVALID_ORDER_CREATE");
 if(!/^[a-f0-9-]{36}$/i.test(event.orderId)||!event.tenantId||!event.branchId)throw Error("EDGE_INVALID_ORDER_CREATE");
 // Offline creation supports a plain takeaway cart only. Unknown options, totals,
 // payment claims or customer metadata must never be silently discarded.
 const allowedPayloadKeys=new Set(["id","branchId","items","status","createdAt"]);
 if(Object.keys(event.payload).some(key=>!allowedPayloadKeys.has(key)))throw Error("EDGE_UNSUPPORTED_ORDER_FIELDS");
 if(event.payload.branchId!==event.branchId||event.payload.status!=="new"||typeof event.payload.createdAt!=="string"||!Number.isFinite(Date.parse(event.payload.createdAt)))throw Error("EDGE_INVALID_LOCAL_ORDER_METADATA");
 if(!Array.isArray(event.payload.items)||event.payload.items.some(item=>!item||typeof item!=="object"||Array.isArray(item)||Object.keys(item).some(key=>!["id","quantity"].includes(key))))throw Error("EDGE_UNSUPPORTED_ITEM_FIELDS");
 if(!context||typeof context.actorUserId!=="string"||!/^[a-f0-9-]{36}$/i.test(context.actorUserId))throw Error("EDGE_AUTHENTICATED_ACTOR_REQUIRED");
 if(context.source!=="trusted_server_policy"||context.taxPolicyResolved!==true||context.discountPolicyResolved!==true||context.optionsPolicyResolved!==true)throw Error("EDGE_ORDER_POLICY_UNRESOLVED");
 if(context.taxCents!==0||context.discountCents!==0)throw Error("EDGE_NONZERO_ADJUSTMENTS_NOT_IMPLEMENTED");
 const channel=context.channel;
 if(channel!=="takeaway")throw Error("EDGE_ORDER_CHANNEL_NOT_READY");
 const [actors]=await connection.execute("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id AND m.tenant_id=? AND m.status='active' WHERE u.id=? AND u.status='active' AND m.role IN ('owner','manager','cashier') FOR UPDATE",[event.tenantId,context.actorUserId]);
 if(actors.length!==1)throw Error("EDGE_ACTOR_NOT_AUTHORIZED");
 const priced=await priceEdgeItems(connection,{tenantId:event.tenantId,branchId:event.branchId,items:event.payload.items});
 const total=(priced.subtotalCents/100).toFixed(2);
 await connection.execute("INSERT INTO restaurant_orders (id,tenant_id,branch_id,created_by,channel,status,payment_status,subtotal,discount,total,currency) VALUES (?,?,?,?,?,'new','unpaid',?,0,?,?)",[event.orderId,event.tenantId,event.branchId,context.actorUserId,channel,total,total,priced.currency]);
 for(const item of priced.items){
  await connection.execute("INSERT INTO restaurant_order_items (id,tenant_id,order_id,menu_item_id,item_name,quantity,unit_price,line_total,options_snapshot) VALUES (?,?,?,?,?,?,?,?,NULL)",[randomUUID(),event.tenantId,event.orderId,item.menuItemId,item.name,item.quantity,(item.unitCents/100).toFixed(2),(item.lineCents/100).toFixed(2)]);
 }
 return {total,currency:priced.currency,itemCount:priced.items.length};
}
