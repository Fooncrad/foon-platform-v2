import {NextRequest,NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import type {RowDataPacket} from "mysql2/promise";
import {validAnalyticsId} from "@/lib/analytics/public-visits";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
const summary=async(where:string,values:string[])=>{
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT COUNT(*) AS total,COALESCE(SUM(visit_day=UTC_DATE()),0) AS today,"+
  "COALESCE(SUM(visit_day>=DATE_SUB(UTC_DATE(),INTERVAL 6 DAY)),0) AS last7 FROM public_page_visits WHERE "+where,values);
 return {total:Number(rows[0]?.total??0),today:Number(rows[0]?.today??0),last7:Number(rows[0]?.last7??0)};
};
export async function GET(request:NextRequest){
 const account=await currentUserId();
 if(!account)return NextResponse.json({ok:false,error:"SIGN_IN_REQUIRED"},{status:401,headers:noStore});
 const db=database(),search=request.nextUrl.searchParams;
 try{
  if(search.get("scope")==="creator"){
   const [owners]=await db.execute<RowDataPacket[]>(
    "SELECT p.handle,p.visibility FROM customer_creator_profiles p "+
    "WHERE p.user_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
    "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",[account]);
   const own=owners[0];
   if(!own)return NextResponse.json({ok:true,profile:null,visits:{total:0,today:0,last7:0}},{headers:noStore});
   const visits=await summary("target_kind='creator_profile' AND target_id=?",[account]);
   return NextResponse.json({ok:true,profile:{handle:String(own.handle),visibility:String(own.visibility)},visits},{headers:noStore});
  }
  const tenantId=search.get("tenant")??"";
  if(!validAnalyticsId(tenantId))return NextResponse.json({ok:false,error:"INVALID_TENANT"},{status:400,headers:noStore});
  const [granted]=await db.execute<RowDataPacket[]>(
   "SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('owner','manager') LIMIT 1",
   [tenantId,account]);
  if(!granted.length)return NextResponse.json({ok:false,error:"NOT_ALLOWED"},{status:403,headers:noStore});
  const limit=25,offset=Math.min(5000,Math.max(0,Number.parseInt(search.get("offset")??"0",10)||0));
  const [storefront,products,[productRows],[countRows]]=await Promise.all([
   summary("target_kind='storefront' AND tenant_id=?",[tenantId]),
   summary("target_kind IN ('restaurant_item','catalog_product') AND tenant_id=?",[tenantId]),
   db.execute<RowDataPacket[]>(
    "SELECT item_id,kind,name,visits FROM ("+
    "SELECT r.id AS item_id,'restaurant_item' AS kind,r.name,COALESCE(rv.visits,0) AS visits "+
    "FROM restaurant_menu_items r LEFT JOIN ("+
    "SELECT target_id,COUNT(*) AS visits FROM public_page_visits WHERE tenant_id=? AND target_kind='restaurant_item' GROUP BY target_id"+
    ") rv ON rv.target_id=r.id WHERE r.tenant_id=? "+
    "UNION ALL "+
    "SELECT p.id AS item_id,'catalog_product' AS kind,p.name_ar AS name,COALESCE(pv.visits,0) AS visits "+
    "FROM catalog_products p LEFT JOIN ("+
    "SELECT target_id,COUNT(*) AS visits FROM public_page_visits WHERE tenant_id=? AND target_kind='catalog_product' GROUP BY target_id"+
    ") pv ON pv.target_id=p.id WHERE p.tenant_id=?"+
    ") items ORDER BY visits DESC,name,item_id LIMIT ? OFFSET ?",
    [tenantId,tenantId,tenantId,tenantId,limit,offset]),
   db.execute<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM restaurant_menu_items WHERE tenant_id=?)+"+
    "(SELECT COUNT(*) FROM catalog_products WHERE tenant_id=?) AS total",[tenantId,tenantId])
  ]);
  return NextResponse.json({ok:true,storefront,products,
   productCount:Number(countRows[0]?.total??0),
   items:productRows.map(row=>({id:String(row.item_id),kind:String(row.kind),name:String(row.name),views:Number(row.visits??0)})),
   limit,offset},{headers:noStore});
 }catch(error){
  console.error("PUBLIC_VISIT_STATS_UNAVAILABLE",error);
  return NextResponse.json({ok:false,error:"VISIT_ANALYTICS_UNAVAILABLE"},{status:503,headers:noStore});
 }
}
