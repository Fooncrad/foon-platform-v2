import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {validStoreSlug} from "@/scripts/store-slug.mjs";

export const runtime="nodejs";
export async function GET(request:Request){
 const query=new URL(request.url).searchParams,slug=query.get("storeSlug")??"",branchId=query.get("branchId")??"";
 if(!validStoreSlug(slug)||!/^[-a-f0-9]{36}$/i.test(branchId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=await database().getConnection();
 try{
  const [stores]=await db.execute<RowDataPacket[]>("SELECT id FROM tenants WHERE slug=? AND status='active' LIMIT 1",[slug]);
  if(!stores.length)return NextResponse.json({ok:false,code:"STORE_UNAVAILABLE"},{status:404});
  const tenantId=String(stores[0].id);
  const [branches]=await db.execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branchId,tenantId]);
  if(!branches.length)return NextResponse.json({ok:false,code:"BRANCH_UNAVAILABLE"},{status:404});
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id,name,data FROM restaurant_resources WHERE tenant_id=? AND branch_id=? AND kind='pickup_point' AND status='active' AND archived=FALSE ORDER BY name,id",[tenantId,branchId]);
  return NextResponse.json({ok:true,points:rows.map(row=>{let data:Record<string,unknown>={};try{data=typeof row.data==="string"?JSON.parse(row.data):row.data??{};}catch{}return{id:String(row.id),name:String(row.name),nameEn:String(data.nameEn??""),nameFr:String(data.nameFr??""),address:String(data.address??""),addressEn:String(data.addressEn??""),addressFr:String(data.addressFr??""),instructions:String(data.instructions??""),mapUrl:String(data.mapUrl??"")};})},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false,code:"PICKUP_POINTS_UNAVAILABLE"},{status:503});}finally{db.release();}
}
