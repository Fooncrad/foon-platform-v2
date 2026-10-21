/** Use only orders already filtered by ordersRows for this authenticated staff user.
 * Global branch aggregates must never be exposed to waiters or drivers. */
export type ScopedStaffOrder={status?:string|null;table_id?:string|null};
export function scopedStaffOverview<T extends ScopedStaffOrder>(orders:T[],assignedWaiterCalls=0){
 const waiterCalls=Number.isSafeInteger(assignedWaiterCalls)&&assignedWaiterCalls>0?assignedWaiterCalls:0;
 const pending=orders.filter(order=>["new","preparing","ready"].includes(String(order.status)));
 return {
  attention:(waiterCalls?{tables:waiterCalls}:{}) as Record<string,number>,
  summary:{
   waiterCalls,reservations:0,outstandingOrders:pending.length,
   sales:null,orders:orders.length,average:null,
   newOrders:orders.filter(order=>order.status==="new").length,
   preparing:orders.filter(order=>order.status==="preparing").length,
   ready:orders.filter(order=>order.status==="ready").length,
   tables:new Set(pending.map(order=>order.table_id).filter(Boolean)).size
  },
  series:[] as {day:string;total:number}[],
  orders
 };
}
