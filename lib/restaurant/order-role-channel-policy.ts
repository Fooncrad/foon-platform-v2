// Authorization helper shared by the server order state machine and POS/KDS UI.
// Status-transition validity is checked independently by the server; never use
// this function as a replacement for membership, branch or driver assignment.
export function canRoleTransitionOrder(
 role:string,channel:string,previous:string,next:string|undefined
):boolean{
 if(!next)return false;
 if(["owner","manager","cashier"].includes(role))return true;
 if(role==="kitchen")return previous==="new"&&next==="preparing"||previous==="preparing"&&next==="ready";
 if(role==="waiter")return (channel==="dine_in"||channel==="room_service")&&previous==="ready"&&next==="completed";
 if(role==="driver")return channel==="delivery"&&previous==="ready"&&next==="completed";
 return false;
}
export function waiterCanSeeOrderChannel(channel:string):boolean{
 return channel==="dine_in"||channel==="room_service";
}
