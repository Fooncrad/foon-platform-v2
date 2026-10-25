export type FloorBookingPolicy={enabled:boolean;bookingFee:number;sessionMinutes:number;orderPolicy:"optional"|"required"|"disabled";refundPolicy:"restaurant"|"nonrefundable"};
export const defaultFloorBookingPolicy:FloorBookingPolicy={enabled:false,bookingFee:0,sessionMinutes:90,orderPolicy:"optional",refundPolicy:"restaurant"};
export function parseFloorBookingPolicy(x:unknown):FloorBookingPolicy|null{
 if(!x||typeof x!=="object"||Array.isArray(x))return null;
 const p=x as Record<string,unknown>;
 if(typeof p.enabled!=="boolean"||typeof p.bookingFee!=="number"||!Number.isFinite(p.bookingFee)||p.bookingFee<0.01||p.bookingFee>100000||Math.round(p.bookingFee*100)!==p.bookingFee*100||!Number.isInteger(p.sessionMinutes)||Number(p.sessionMinutes)<30||Number(p.sessionMinutes)>360||!["optional","required","disabled"].includes(String(p.orderPolicy))||!["restaurant","nonrefundable"].includes(String(p.refundPolicy)))return null;
 return p as FloorBookingPolicy;
}
export function canSelectFloorSeat(input:{channel:"classic"|"floor";feePaid:boolean;seatAvailable:boolean;layoutLinked:boolean;policyEnabled:boolean}):boolean{return input.channel==="floor"&&input.feePaid&&input.seatAvailable&&input.layoutLinked&&input.policyEnabled}
