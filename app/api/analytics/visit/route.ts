import {NextRequest,NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import type {RowDataPacket} from "mysql2/promise";
import {PUBLIC_VISIT_KINDS,isLikelyRobot,validAnalyticsId,validAnalyticsSlug,visitFingerprint,visitorCookieName,visitorCookieOptions,visitorToken,type PublicVisitKind} from "@/lib/analytics/public-visits";

export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(request:NextRequest){
 const origin=request.headers.get("origin");
 if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({ok:false,error:"INVALID_ORIGIN"},{status:403});
 const site=request.headers.get("sec-fetch-site");
 if(site&&site!=="same-origin"&&site!=="none")return NextResponse.json({ok:false,error:"INVALID_ORIGIN"},{status:403});
 if(isLikelyRobot(request.headers.get("user-agent")??""))return NextResponse.json({ok:true,recorded:false});
 let body:Record<string,unknown>;
 try{
  const text=await request.text();
  if(text.length>512)return NextResponse.json({ok:false,error:"INVALID_INPUT"},{status:400});
  const parsed:unknown=JSON.parse(text);
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw Error("INVALID_BODY");
  body=parsed as Record<string,unknown>;
 }catch{return NextResponse.json({ok:false,error:"INVALID_INPUT"},{status:400});}
 const kind=body.kind;
 if(typeof kind!=="string"||!PUBLIC_VISIT_KINDS.has(kind as PublicVisitKind))return NextResponse.json({ok:false,error:"INVALID_KIND"},{status:400});
 const db=database(),actor=await currentUserId();
 let tenantId="",subject="";
 try{
  if(kind==="creator_profile"){
   if(!validAnalyticsSlug(body.handle))return NextResponse.json({ok:false,error:"INVALID_HANDLE"},{status:400});
   const [rows]=await db.execute<RowDataPacket[]>(
    "SELECT p.user_id FROM customer_creator_profiles p JOIN users u ON u.id=p.user_id AND u.status='active' WHERE p.handle=? AND p.visibility='public' AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",
    [body.handle]);
   if(!rows.length)return NextResponse.json({ok:true,recorded:false});
   subject=String(rows[0].user_id);
   if(actor===subject)return NextResponse.json({ok:true,recorded:false});
  }else{
   if(!validAnalyticsSlug(body.slug))return NextResponse.json({ok:false,error:"INVALID_STORE"},{status:400});
   const [tenantRows]=await db.execute<RowDataPacket[]>("SELECT id FROM tenants WHERE slug=? AND status='active' LIMIT 1",[body.slug]);
   if(!tenantRows.length)return NextResponse.json({ok:true,recorded:false});
   tenantId=String(tenantRows[0].id);
   if(actor){
    const [owner]=await db.execute<RowDataPacket[]>(
     "SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' LIMIT 1",[tenantId,actor]);
    if(owner.length)return NextResponse.json({ok:true,recorded:false});
   }
   if(kind==="storefront")subject=tenantId;
   else{
    if(!validAnalyticsId(body.id))return NextResponse.json({ok:false,error:"INVALID_PRODUCT"},{status:400});
    const source=kind==="restaurant_item"?"restaurant_menu_items":"catalog_products";
    const [products]=await db.execute<RowDataPacket[]>(
     "SELECT 1 FROM "+source+" WHERE tenant_id=? AND id=? AND enabled=TRUE LIMIT 1",
     [tenantId,body.id]);
    if(!products.length)return NextResponse.json({ok:true,recorded:false});
    subject=String(body.id);
   }
  }
  const day=new Date().toISOString().slice(0,10);
  const token=visitorToken(request.cookies.get(visitorCookieName)?.value);
  const visitorHash=visitFingerprint(token,kind as PublicVisitKind,subject,day);
  const [result]=await db.execute("INSERT IGNORE INTO public_page_visits(target_kind,tenant_id,target_id,visit_day,visitor_hash) VALUES (?,?,?,?,?)",
   [kind,tenantId,subject,day,visitorHash]);
  const reply=NextResponse.json({ok:true,recorded:(result as {affectedRows?:number}).affectedRows===1});
  reply.headers.set("Cache-Control","private, no-store");
  reply.cookies.set(visitorCookieName,token,{...visitorCookieOptions,secure:process.env.NODE_ENV==="production"});
  return reply;
 }catch(error){
  console.error("PUBLIC_VISITS_UNAVAILABLE",error);
  return NextResponse.json({ok:false,error:"VISIT_ANALYTICS_UNAVAILABLE"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
