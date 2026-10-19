import {database} from "@/lib/db/mysql";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {normalizePublicControls,defaultPublicControls,type PublicControls} from "./public-controls-core";
export * from "./public-controls-core";
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
