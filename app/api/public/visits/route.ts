import {NextRequest,NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {countPublicVisits,recordPublicVisit,visitorFingerprint,isVisitRobot,publicVisitorCookie,publicVisitorCookieOptions,publicVisitorToken,type PublicVisitKind} from "@/lib/analytics/public-visits";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
function validId(x:unknown){return typeof x==="string"&&x.length>0&&x.length<=128&&/^[a-zA-Z0-9_-]+$/.test(x);}
export async function POST(request:NextRequest){
 try{
  const origin=request.headers.get("origin");
  if(origin&&origin!==request.nextUrl.origin)return NextResponse.json({ok:false,code:"INVALID_ORIGIN"},{status:403,headers:noStore});
  const site=request.headers.get("sec-fetch-site");
  if(site&&site!=="same-origin"&&site!=="none")return NextResponse.json({ok:false,code:"INVALID_ORIGIN"},{status:403,headers:noStore});
  if(isVisitRobot(request.headers.get("user-agent")??""))return NextResponse.json({ok:true,counted:false},{headers:noStore});
  const input=await request.text();
  if(input.length>512)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400,headers:noStore});
  const body=JSON.parse(input) as Record<string,unknown>;
  if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400,headers:noStore});
  const kind=body.kind as PublicVisitKind;
  if(!["storefront","product","profile"].includes(kind)||!validId(body.id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400,headers:noStore});
  const viewer=await currentUserId();
  let tenantId="",resourceId="",ownerUserId="";
  if(kind==="profile"){
   ownerUserId=String(body.id);
   const [owners]=await database().execute<RowDataPacket[]>(
    "SELECT p.user_id FROM customer_creator_profiles p JOIN users u ON u.id=p.user_id AND u.status='active' "+
    "WHERE p.user_id=? AND p.visibility='public' "+
    "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=p.user_id) "+
    "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=p.user_id) LIMIT 1",
    [ownerUserId]);
   if(!owners.length)return NextResponse.json({ok:true,counted:false},{headers:noStore});
   if(viewer===ownerUserId)return NextResponse.json({ok:true,counted:false},{headers:noStore});
  }else{
   const [tenants]=await database().execute<RowDataPacket[]>("SELECT id FROM tenants WHERE slug=? AND status='active' LIMIT 1",[String(body.id)]);
   if(!tenants.length)return NextResponse.json({ok:true,counted:false},{headers:noStore});
   tenantId=String(tenants[0].id);
   if(viewer){
    const [[staff],[admins]]=await Promise.all([
     database().execute<RowDataPacket[]>("SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' LIMIT 1",[tenantId,viewer]),
     database().execute<RowDataPacket[]>("SELECT 1 FROM platform_admins WHERE user_id=? LIMIT 1",[viewer])
    ]);
    if(staff.length||admins.length)return NextResponse.json({ok:true,counted:false},{headers:noStore});
   }
   if(kind==="product"){
    if(!validId(body.productId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400,headers:noStore});
    resourceId=String(body.productId);
    const restaurant=body.source==="restaurant";
    const productTable=restaurant?"restaurant_menu_items":"catalog_products";
    const categoryTable=restaurant?"restaurant_menu_categories":"catalog_categories";
    const [products]=await database().execute<RowDataPacket[]>(
     "SELECT 1 FROM "+productTable+" p JOIN "+categoryTable+" c ON c.id=p.category_id AND c.tenant_id=p.tenant_id "+
     "AND c.enabled=TRUE WHERE p.tenant_id=? AND p.id=? AND p.enabled=TRUE LIMIT 1",
     [tenantId,resourceId]);
    if(!products.length)return NextResponse.json({ok:true,counted:false},{headers:noStore});
   }
  }
  const token=publicVisitorToken(request.cookies.get(publicVisitorCookie)?.value);
  await recordPublicVisit(kind,tenantId,resourceId,ownerUserId,visitorFingerprint(request,viewer,token));
  const response=NextResponse.json({ok:true},{headers:noStore});
  response.cookies.set(publicVisitorCookie,token,{...publicVisitorCookieOptions,secure:process.env.NODE_ENV==="production"});
  return response;
 }catch(error){
  console.error("PUBLIC_VISIT_UNAVAILABLE",error);
  return NextResponse.json({ok:false,code:"VISIT_UNAVAILABLE"},{status:503,headers:noStore});
 }
}
export async function GET(request:Request){
 try{
  const url=new URL(request.url),kind=url.searchParams.get("kind");
  const viewer=await currentUserId();
  if(!viewer)return NextResponse.json({ok:false,code:"AUTH_REQUIRED"},{status:401,headers:noStore});
  if(kind==="profile"){
   const owner=url.searchParams.get("userId")||viewer;
   if(owner!==viewer)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403,headers:noStore});
   return NextResponse.json({ok:true,visits:await countPublicVisits("profile","","",viewer)},{headers:noStore});
  }
  if(kind!=="storefront"&&kind!=="product")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400,headers:noStore});
  const tenantId=url.searchParams.get("tenantId")||"";
  if(!validId(tenantId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400,headers:noStore});
  const [membership]=await database().execute<RowDataPacket[]>("SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' AND role IN ('owner','manager') LIMIT 1",[tenantId,viewer]);
  if(!membership.length)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403,headers:noStore});
  const productId=kind==="product"?(url.searchParams.get("productId")||""):"";
  if(kind==="product"&&!validId(productId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400,headers:noStore});
  return NextResponse.json({ok:true,visits:await countPublicVisits(kind,tenantId,productId,"")},{headers:noStore});
 }catch(error){
  console.error("PUBLIC_VISIT_STATS_UNAVAILABLE",error);
  return NextResponse.json({ok:false,code:"VISITS_UNAVAILABLE"},{status:503,headers:noStore});
 }
}
