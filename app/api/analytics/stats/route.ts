import {NextRequest,NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import type {RowDataPacket} from "mysql2/promise";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
const validId=(v:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
async function counts(where:string,args:string[]){
 const today="DATE(UTC_TIMESTAMP()+INTERVAL 3 HOUR)";
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT COUNT(*) AS total,COALESCE(SUM(visit_date="+today+"),0) AS today,"+
  "COALESCE(SUM(visit_date>=DATE_SUB("+today+",INTERVAL 6 DAY)),0) AS last7 "+
  "FROM public_visit_daily WHERE "+where,args);
 return {total:Number(rows[0]?.total??0),today:Number(rows[0]?.today??0),last7:Number(rows[0]?.last7??0)};
}
export async function GET(request:NextRequest){
 const actor=await currentUserId();
 if(!actor)return NextResponse.json({ok:false,error:"SIGN_IN_REQUIRED"},{status:401,headers:noStore});
 const params=request.nextUrl.searchParams,db=database();
 try{
  if(params.get("scope")==="creator"){
   const [profiles]=await db.execute<RowDataPacket[]>(
    "SELECT p.handle,p.visibility FROM customer_creator_profiles p JOIN users u ON u.id=p.user_id AND u.status='active' "+
    "WHERE p.user_id=? AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
    "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",[actor]);
   const profile=profiles[0];
   if(!profile)return NextResponse.json({ok:true,profile:null,visits:{total:0,today:0,last7:0}},{headers:noStore});
   const visits=await counts("kind='profile' AND owner_user_id=?",[actor]);
   return NextResponse.json({ok:true,profile:{handle:String(profile.handle),visibility:String(profile.visibility)},visits},{headers:noStore});
  }
  const tenant=params.get("tenant")??"";
  if(!validId(tenant))return NextResponse.json({ok:false,error:"INVALID_TENANT"},{status:400,headers:noStore});
  const [granted]=await db.execute<RowDataPacket[]>(
   "SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('owner','manager') LIMIT 1",
   [tenant,actor]);
  if(!granted.length)return NextResponse.json({ok:false,error:"NOT_ALLOWED"},{status:403,headers:noStore});
  const limit=25,offset=Math.max(0,Math.min(5000,Number.parseInt(params.get("offset")??"0",10)||0));
  const [storefront,products,[rows],[totals]]=await Promise.all([
   counts("kind='storefront' AND tenant_id=?",[tenant]),
   counts("kind='product' AND tenant_id=?",[tenant]),
   db.execute<RowDataPacket[]>(
    "SELECT item_id,kind,name,visits FROM ("+
    "SELECT r.id AS item_id,'restaurant_item' AS kind,r.name,COALESCE(rv.visits,0) AS visits "+
    "FROM restaurant_menu_items r LEFT JOIN ("+
    "SELECT resource_id,COUNT(*) AS visits FROM public_visit_daily WHERE tenant_id=? AND kind='product' GROUP BY resource_id"+
    ") rv ON rv.resource_id=r.id WHERE r.tenant_id=? "+
    "UNION ALL "+
    "SELECT p.id AS item_id,'catalog_product' AS kind,p.name_ar AS name,COALESCE(pv.visits,0) AS visits "+
    "FROM catalog_products p LEFT JOIN ("+
    "SELECT resource_id,COUNT(*) AS visits FROM public_visit_daily WHERE tenant_id=? AND kind='product' GROUP BY resource_id"+
    ") pv ON pv.resource_id=p.id WHERE p.tenant_id=?"+
    ") public_items ORDER BY visits DESC,name,item_id LIMIT ? OFFSET ?",
    [tenant,tenant,tenant,tenant,limit,offset]),
   db.execute<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM restaurant_menu_items WHERE tenant_id=?)+"+
    "(SELECT COUNT(*) FROM catalog_products WHERE tenant_id=?) AS total",[tenant,tenant])
  ]);
  return NextResponse.json({ok:true,storefront,products,productCount:Number(totals[0]?.total??0),limit,offset,
   items:rows.map(r=>({id:String(r.item_id),kind:String(r.kind),name:String(r.name),views:Number(r.visits??0)}))},{headers:noStore});
 }catch(error){
  console.error("PUBLIC_VISIT_DASHBOARD_UNAVAILABLE",error);
  return NextResponse.json({ok:false,error:"VISIT_ANALYTICS_UNAVAILABLE"},{status:503,headers:noStore});
 }
}
