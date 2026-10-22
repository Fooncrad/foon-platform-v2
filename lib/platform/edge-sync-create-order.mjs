import {randomUUID} from "node:crypto";
import {priceEdgeItems} from "./edge-sync-pricing.mjs";
import {checkoutPolicy,checkoutTotals} from "../restaurant/checkout-pricing.ts";
// Must run inside the inbox transaction. Actor comes from authenticated device registration,
// never the event payload. Tax/discount policy must be resolved by trusted server code.
export async function insertPricedEdgeOrder(connection,event,context){
 if(!event||event.kind!=="created"||!event.payload||event.payload.id!==event.orderId)throw Error("EDGE_INVALID_ORDER_CREATE");
 if(!/^[a-f0-9-]{36}$/i.test(event.orderId)||!event.tenantId||!event.branchId)throw Error("EDGE_INVALID_ORDER_CREATE");
 // Offline creation supports a plain takeaway cart only. Unknown options, totals,
 // payment claims or customer metadata must never be silently discarded.
 const allowedPayloadKeys=new Set(["id","branchId","items","status","createdAt","expectedTotalCents"]);
 if(Object.keys(event.payload).some(key=>!allowedPayloadKeys.has(key)))throw Error("EDGE_UNSUPPORTED_ORDER_FIELDS");
 if(event.payload.branchId!==event.branchId||event.payload.status!=="new"||typeof event.payload.createdAt!=="string"||!Number.isFinite(Date.parse(event.payload.createdAt)))throw Error("EDGE_INVALID_LOCAL_ORDER_METADATA");
 if(!Array.isArray(event.payload.items)||event.payload.items.some(item=>!item||typeof item!=="object"||Array.isArray(item)||Object.keys(item).some(key=>!["id","quantity","expectedUnitCents","expectedCurrency"].includes(key))))throw Error("EDGE_UNSUPPORTED_ITEM_FIELDS");
 if(!context||typeof context.actorUserId!=="string"||!/^[a-f0-9-]{36}$/i.test(context.actorUserId))throw Error("EDGE_AUTHENTICATED_ACTOR_REQUIRED");
 if(context.source!=="trusted_server_policy"||context.taxPolicyResolved!==true||context.discountPolicyResolved!==true||context.optionsPolicyResolved!==true)throw Error("EDGE_ORDER_POLICY_UNRESOLVED");
 if(context.taxCents!==0||context.discountCents!==0)throw Error("EDGE_NONZERO_ADJUSTMENTS_NOT_IMPLEMENTED");
 const channel=context.channel;
 if(channel!=="takeaway")throw Error("EDGE_ORDER_CHANNEL_NOT_READY");
 const [actors]=await connection.execute("SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id AND m.tenant_id=? AND m.status='active' WHERE u.id=? AND u.status='active' AND m.role IN ('owner','manager','cashier') FOR UPDATE",[event.tenantId,context.actorUserId]);
 if(actors.length!==1)throw Error("EDGE_ACTOR_NOT_AUTHORIZED");
 const priced=await priceEdgeItems(connection,{tenantId:event.tenantId,branchId:event.branchId,items:event.payload.items});
 for(const item of event.payload.items){
  const actual=priced.items.find(line=>line.menuItemId===item.id);
  if(context.requirePriceConfirmation&&(item.expectedUnitCents===undefined||item.expectedCurrency===undefined))throw Error("EDGE_PRICE_CONFIRMATION_REQUIRED");
  if(item.expectedUnitCents!==undefined&&(!Number.isSafeInteger(item.expectedUnitCents)||item.expectedUnitCents<0||item.expectedUnitCents!==actual.unitCents)||item.expectedCurrency!==undefined&&item.expectedCurrency!==priced.currency)throw Error("EDGE_CATALOG_PRICE_CHANGED");
 }
 // Same authoritative VAT/fee policy and snapshot as the online POS (lib/restaurant/checkout-settings.ts).
 const [settings]=await connection.execute("SELECT t.name,r.data FROM tenants t LEFT JOIN restaurant_resources r ON r.tenant_id=t.id AND r.kind='storefront_config' AND r.status='active' AND r.archived=FALSE WHERE t.id=? ORDER BY r.created_at DESC LIMIT 1",[event.tenantId]);
 let data,policy,totals;
 try{
  const raw=settings[0]?.data;
  data=raw===null||raw===undefined||raw===""?{}:typeof raw==="string"?JSON.parse(raw):raw;
  if(!data||typeof data!=="object"||Array.isArray(data))throw Error("INVALID_CHECKOUT_SETTINGS");
  policy=checkoutPolicy(data);
  totals=checkoutTotals(priced.subtotalCents/100,0,channel,policy);
 }catch{throw Error("EDGE_INVALID_CHECKOUT_SETTINGS");}
 const seller={name:String(data.legalName||data.brandName||settings[0]?.name||""),taxNumber:String(data.taxNumber||""),address:String(data.address||""),phone:String(data.phone||"")};
 if(event.payload.expectedTotalCents!==undefined&&(!Number.isSafeInteger(event.payload.expectedTotalCents)||event.payload.expectedTotalCents<0||event.payload.expectedTotalCents!==Math.round(totals.total*100)))throw Error("EDGE_CHECKOUT_TOTAL_CHANGED");
 const subtotal=(priced.subtotalCents/100).toFixed(2),total=totals.total.toFixed(2);
 await connection.execute("INSERT INTO restaurant_orders (id,tenant_id,branch_id,created_by,channel,status,payment_status,subtotal,discount,total,currency,checkout_snapshot) VALUES (?,?,?,?,?,'new','unpaid',?,0,?,?,?)",[event.orderId,event.tenantId,event.branchId,context.actorUserId,channel,subtotal,total,priced.currency,JSON.stringify({version:1,policy,seller,...totals})]);
 for(const item of priced.items){
  await connection.execute("INSERT INTO restaurant_order_items (id,tenant_id,order_id,menu_item_id,item_name,quantity,unit_price,line_total,options_snapshot) VALUES (?,?,?,?,?,?,?,?,NULL)",[randomUUID(),event.tenantId,event.orderId,item.menuItemId,item.name,item.quantity,(item.unitCents/100).toFixed(2),(item.lineCents/100).toFixed(2)]);
 }
 return {total,tax:totals.tax.toFixed(2),currency:priced.currency,itemCount:priced.items.length};
}
