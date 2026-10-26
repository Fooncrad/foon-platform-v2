import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {tenantPublicControls} from "@/lib/tenant/public-controls";
import {tenantEntitlement} from "@/lib/plans/entitlements";
import {validFloorPlan} from "@/lib/restaurant/floor-plan";
export const runtime="nodejs";
export async function GET(request:Request){
 const url=new URL(request.url),slug=url.searchParams.get("storeSlug"),branch=url.searchParams.get("branch");
 if(!slug||slug.length>120||!branch||!/^[a-f0-9-]{36}$/i.test(branch))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const db=database();
  const [stores]=await db.execute<RowDataPacket[]>("SELECT t.id FROM tenants t JOIN branches b ON b.tenant_id=t.id AND b.id=? AND b.enabled=TRUE WHERE t.slug=? AND t.status='active' LIMIT 1",[branch,slug]);
  if(!stores.length)return NextResponse.json({ok:false,code:"NOT_FOUND"},{status:404});
  const tenant=String(stores[0].id);
  const controls=await tenantPublicControls(tenant,db);
  if(!controls.reservations||!(await tenantEntitlement(tenant,"reservations")).enabled)return NextResponse.json({ok:true,layouts:[]},{headers:{"Cache-Control":"private, no-store"}});
  const [layouts]=await db.execute<RowDataPacket[]>("SELECT p.id,p.section_id,p.name,p.layout_json,s.name AS section_name,s.data AS section_data FROM restaurant_floor_plan_layouts p JOIN restaurant_resources s ON s.tenant_id=p.tenant_id AND s.id=p.section_id AND s.kind='dining_section' AND s.archived=FALSE AND s.status='active' AND (s.branch_id=p.branch_id OR s.branch_id IS NULL) WHERE p.tenant_id=? AND p.branch_id=? AND p.is_active=TRUE ORDER BY p.created_at LIMIT 60",[tenant,branch]);
  const [linked]=await db.execute<RowDataPacket[]>("SELECT l.layout_id,l.floor_table_id,t.id AS real_id,t.status AS real_status FROM restaurant_floor_table_links l JOIN restaurant_resources t ON t.id=l.dining_table_id AND t.tenant_id=l.tenant_id AND t.kind='dining_table' AND t.archived=FALSE AND (t.branch_id=l.branch_id OR t.branch_id IS NULL) WHERE l.tenant_id=? AND l.branch_id=?",[tenant,branch]);
  const [ops]=await db.execute<RowDataPacket[]>("SELECT layout_id,floor_table_id,status FROM restaurant_floor_table_operations WHERE tenant_id=? AND branch_id=?",[tenant,branch]);
  const [fees]=await db.execute<RowDataPacket[]>("SELECT booking_fee FROM restaurant_floor_booking_policies WHERE tenant_id=? AND branch_id=? LIMIT 1",[tenant,branch]);
  const bookingFee=Number(fees[0]?.booking_fee??0);
  const result=layouts.flatMap(l=>{
   let plan:unknown;try{plan=typeof l.layout_json==="string"?JSON.parse(l.layout_json):l.layout_json}catch{return []}
   if(!validFloorPlan(plan))return [];
   let sectionData:Record<string,unknown>={};try{sectionData=typeof l.section_data==="string"?JSON.parse(l.section_data):l.section_data??{}}catch{/* Nonessential translated labels */}
   const tables=plan.tables.flatMap(table=>{
    const link=linked.find(x=>String(x.layout_id)===String(l.id)&&String(x.floor_table_id)===table.id);
    if(!link)return [];
    const op=ops.find(x=>String(x.layout_id)===String(l.id)&&String(x.floor_table_id)===table.id);
    const real=String(link.real_status);
    // Operational availability is NOT a time-slot guarantee.
    const status=real==="inactive"?"out_of_service":["occupied","reserved"].includes(real)?real:String(op?.status||"available");
    return [{id:table.id,number:table.number,seats:table.seats,x:table.x,y:table.y,status}];
   });
   if(!tables.length)return [];
   return [{id:String(l.id),sectionId:String(l.section_id),sectionName:String(l.section_name),sectionNameEn:String(sectionData.nameEn||""),sectionNameFr:String(sectionData.nameFr||""),name:String(l.name),width:plan.width,height:plan.height,tables}];
  });
  return NextResponse.json({ok:true,layouts:result,bookingFee:Number.isFinite(bookingFee)?bookingFee:0,availabilityVerified:false},{headers:{"Cache-Control":"private, no-store"}});
 }catch(error){console.error("[customer-floor-map]",error instanceof Error?error.message:"UNAVAILABLE");return NextResponse.json({ok:false,code:"FLOOR_MAP_UNAVAILABLE"},{status:503})}
}
