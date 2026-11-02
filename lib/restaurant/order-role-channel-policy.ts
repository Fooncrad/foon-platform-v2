// Authorization helper shared by the server order state machine and POS/KDS UI.
// Status-transition validity is checked independently by the server; never use
// this function as a replacement for membership, branch or driver assignment.
// Until room-service orders have explicit staff assignment, waiters may
// access only the dining tables assigned to them. Never leak hotel room data.
export const WAITER_ORDER_CHANNELS=["dine_in"] as const;
export function canRoleTransitionOrder(
 role:string,channel:string,previous:string,next:string|undefined
):boolean{
 if(!next)return false;
 if(["owner","manager","cashier"].includes(role))return true;
 if(role==="kitchen")return previous==="new"&&next==="preparing"||previous==="preparing"&&next==="ready";
 if(role==="waiter")return WAITER_ORDER_CHANNELS.some(allowed=>allowed===channel)&&previous==="ready"&&next==="completed";
 if(role==="driver")return channel==="delivery"&&previous==="ready"&&next==="completed";
 return false;
}
export function waiterCanSeeOrderChannel(channel:string):boolean{
 return WAITER_ORDER_CHANNELS.some(allowed=>allowed===channel);
}
