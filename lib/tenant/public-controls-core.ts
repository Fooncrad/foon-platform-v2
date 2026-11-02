export const PUBLIC_CONTROLS = ["reservations","sales","cart","waiter","customerLogin","takeaway","delivery","dineIn","roomService","serviceRequests","catalog","search","categories","qr","contact","policies","social"] as const;
export type PublicControl = typeof PUBLIC_CONTROLS[number];
export type PublicControls = Record<PublicControl,boolean>;
export const defaultPublicControls:PublicControls = Object.fromEntries(PUBLIC_CONTROLS.map(key=>[key,true])) as PublicControls;
export function normalizePublicControls(value:unknown):PublicControls {
 const input=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 return Object.fromEntries(PUBLIC_CONTROLS.map(key=>[key,input[key]!==false])) as PublicControls;
}
export function publicControlAllowed(controls:PublicControls,key:PublicControl){
 if(key==="cart")return controls.cart&&controls.sales&&controls.catalog;
 if(["takeaway","delivery","dineIn","roomService"].includes(key))return controls.sales&&controls[key];
 if(key==="serviceRequests")return controls.serviceRequests&&controls.catalog;
 if(key==="reservations"||key==="waiter")return controls[key];
 return controls[key];
}
export const channelControl:Record<string,PublicControl>={takeaway:"takeaway",pickup:"takeaway",delivery:"delivery",dine_in:"dineIn",room_service:"roomService",hotel_service:"roomService",reservation:"reservations"};
