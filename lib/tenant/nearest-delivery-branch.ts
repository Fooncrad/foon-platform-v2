import type {RowDataPacket} from "mysql2/promise";
import {greatCircleKm,validPoint} from "./free-location";

export type DeliveryBranchLocation={id:string;name:string;latitude:number|null;longitude:number|null;acceptsDelivery:boolean};

/** Only documented branch coordinates qualify; never guess from a postal code or city. */
export function nearestDeliveryBranch(branches:DeliveryBranchLocation[], latitude:unknown,longitude:unknown,availableIds?:readonly string[]):string|null{
 if(!validPoint(latitude,longitude))return null;
 const allowed=availableIds?new Set(availableIds):null;
 const candidates=branches.filter(b=>b.acceptsDelivery&&(!allowed||allowed.has(b.id))&&validPoint(b.latitude,b.longitude));
 candidates.sort((a,b)=>greatCircleKm(latitude as number,longitude as number,a.latitude!,a.longitude!)-greatCircleKm(latitude as number,longitude as number,b.latitude!,b.longitude!));
 return candidates[0]?.id??null;
}

/** Tenant-scoped configuration of branch coordinates and enabled delivery channels. */
export async function deliveryBranchLocations(db:{execute:(query:string,params:unknown[])=>Promise<[RowDataPacket[],unknown]>},tenantId:string):Promise<DeliveryBranchLocation[]>{
 const [rows]=await db.execute(
  "SELECT b.id,b.name,c.data FROM branches b LEFT JOIN restaurant_resources c ON c.id=(SELECT r.id FROM restaurant_resources r WHERE r.tenant_id=b.tenant_id AND r.branch_id=b.id AND r.kind='branch_config' AND r.status='active' AND r.archived=FALSE ORDER BY r.updated_at DESC,r.created_at DESC LIMIT 1) WHERE b.tenant_id=? AND b.enabled=TRUE ORDER BY b.created_at,b.id",
  [tenantId]);
 return rows.map(row=>{
  let data:Record<string,unknown>={};
  try{const parsed=typeof row.data==="string"?JSON.parse(row.data):row.data;if(parsed&&typeof parsed==="object"&&!Array.isArray(parsed))data=parsed;}catch{}
  const latitude=data.latitude===null||data.latitude===undefined?null:Number(data.latitude);
  const longitude=data.longitude===null||data.longitude===undefined?null:Number(data.longitude);
  return {id:String(row.id),name:String(row.name),latitude:validPoint(latitude,longitude)?latitude:null,longitude:validPoint(latitude,longitude)?longitude:null,acceptsDelivery:data.ordersEnabled!=="no"&&data.deliveryEnabled!=="no"};
 });
}
