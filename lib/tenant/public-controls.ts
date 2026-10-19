import {database} from "@/lib/db/mysql";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";

export const PUBLIC_CONTROLS = ["reservations","sales","cart","waiter","customerLogin","takeaway","delivery","dineIn","roomService","serviceRequests","catalog","search","categories","qr","contact","policies","social"] as const;
export type PublicControl = typeof PUBLIC_CONTROLS[number];
export type PublicControls = Record<PublicControl,boolean>;
export const defaultPublicControls:PublicControls = Object.fromEntries(PUBLIC_CONTROLS.map(key=>[key,true])) as PublicControls;
export function normalizePublicControls(value:unknown):PublicControls {
 const input=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
 return Object.fromEntries(PUBLIC_CONTROLS.map(key=>[key,input[key]!==false])) as PublicControls;
}
export async function tenantPublicControls(tenantId:string,db:Pick<PoolConnection,"execute">=database()):Promise<PublicControls>{
 try{
  const [rows]=await db.execute<RowDataPacket[]>("SELECT controls FROM tenant_public_controls WHERE tenant_id=? LIMIT 1",[tenantId]);
  const raw=rows[0]?.controls;
  return normalizePublicControls(typeof raw==="string"?JSON.parse(raw):raw);
 }catch(error){
  // Missing table during incremental rollout keeps old sites running. Other
  // database errors must not silently reopen switches set by merchants.
  const code=(error as {code?:string}).code;
  if(code==="ER_NO_SUCH_TABLE")return {...defaultPublicControls};
  throw error;
 }
}
export function publicControlAllowed(controls:PublicControls,key:PublicControl){
 if(key==="cart")return controls.cart&&controls.sales&&controls.catalog;
 if(["takeaway","delivery","dineIn","roomService"].includes(key))return controls.sales&&controls[key];
 if(key==="serviceRequests")return controls.serviceRequests&&controls.catalog;
 if(key==="reservations"||key==="waiter")return controls[key];
 return controls[key];
}
export const channelControl:Record<string,PublicControl>={takeaway:"takeaway",pickup:"takeaway",delivery:"delivery",dine_in:"dineIn",room_service:"roomService",hotel_service:"roomService",reservation:"reservations"};
