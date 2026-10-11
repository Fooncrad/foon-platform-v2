// Validate an offline cart against authoritative tenant catalog prices.
// This is a preparation step, not an order insertion or a tax calculation.
const money=/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/;
function cents(value){
 const s=String(value);
 if(!money.test(s))throw Error("EDGE_INVALID_CATALOG_PRICE");
 const [whole,fraction=""]=s.split(".");
 return Number(whole)*100+Number(fraction.padEnd(2,"0"));
}
export async function priceEdgeItems(connection,{tenantId,branchId,items}){
 if(!tenantId||!branchId||!Array.isArray(items)||items.length===0||items.length>100)throw Error("EDGE_INVALID_CART");
 const ids=new Set();
 for(const item of items){
  if(!item||typeof item.id!=="string"||!/^[a-f0-9-]{36}$/i.test(item.id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000||ids.has(item.id))throw Error("EDGE_INVALID_CART_ITEM");
  ids.add(item.id);
 }
 const placeholders=items.map(()=>"?").join(",");
 const [rows]=await connection.execute(
  `SELECT mi.id,mi.name,mi.price,mi.currency FROM restaurant_menu_items mi JOIN restaurant_resources rr ON rr.id=mi.id AND rr.tenant_id=mi.tenant_id AND rr.archived=0 WHERE mi.tenant_id=? AND mi.enabled=1 AND mi.id IN (${placeholders}) FOR UPDATE`,
  [tenantId,...items.map(x=>x.id)]
 );
 if(rows.length!==items.length)throw Error("EDGE_CATALOG_ITEM_UNAVAILABLE");
 const byId=new Map(rows.map(row=>[row.id,row]));
 const priced=[];let subtotalCents=0,currency=null;
 for(const item of items){
  const row=byId.get(item.id);
  if(!row)throw Error("EDGE_CATALOG_ITEM_UNAVAILABLE");
  if(currency&&currency!==row.currency)throw Error("EDGE_MIXED_CURRENCY");
  currency=row.currency;
  const unitCents=cents(row.price),lineCents=unitCents*item.quantity;
  if(!Number.isSafeInteger(lineCents)||!Number.isSafeInteger(subtotalCents+lineCents)||subtotalCents+lineCents>999999999999)throw Error("EDGE_ORDER_TOTAL_OVERFLOW");
  subtotalCents+=lineCents;
  priced.push({menuItemId:item.id,name:row.name,quantity:item.quantity,unitCents,lineCents});
 }
 return {items:priced,subtotalCents,currency};
}
