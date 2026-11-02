// Pure presentation policy. No order mutations, authorization or payment changes.
export const HIGH_VOLUME_PER_MINUTE=30;
export const HIGH_VOLUME_ACTIVE_COUNT=40;
export const HIGH_VOLUME_PAGE_SIZE=80;
const active=new Set(["new","preparing","ready"]);
export function orderTrafficSnapshot(orders,now=Date.now()){
 const windowStart=now-60000;
 return {perMinute:orders.filter(order=>{const time=Date.parse(order.created_at);return Number.isFinite(time)&&time>=windowStart&&time<=now;}).length,active:orders.filter(order=>active.has(order.status)).length};
}
export function resolveOrdersDisplay(mode,orders,now=Date.now()){
 if(mode==="dense"||mode==="cards")return mode;
 const snapshot=orderTrafficSnapshot(orders,now);
 return snapshot.perMinute>=HIGH_VOLUME_PER_MINUTE||snapshot.active>=HIGH_VOLUME_ACTIVE_COUNT?"dense":"cards";
}
export function activeKitchenOrders(orders){
 return orders.filter(order=>active.has(order.status));
}
export function orderPage(orders,visible=HIGH_VOLUME_PAGE_SIZE){
 return orders.slice(0,Math.max(1,Math.min(10000,Math.floor(visible)||HIGH_VOLUME_PAGE_SIZE)));
}
