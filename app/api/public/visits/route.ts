import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {countPublicVisits,recordPublicVisit,visitorFingerprint,type PublicVisitKind} from "@/lib/analytics/public-visits";

export const runtime="nodejs";
const noStore={"Cache-Control":"no-store"};
function validId(x:unknown){return typeof x==="string"&&x.length>0&&x.length<=128&&/^[a-zA-Z0-9_-]+$/.test(x);}
export async function POST(request:Request){
 try{
  const body=await request.json() as Record<string,unknown>;
  const kind=body.kind as PublicVisitKind;
  if(!["storefront","product","profile"].includes(kind)||!validId(body.id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
  const viewer=await currentUserId();
  let tenantId="",resourceId="",ownerUserId="";
  if(kind==="profile"){
   ownerUserId=String(body.id);
   const [owners]=await database().execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? LIMIT 1",[ownerUserId]);
   if(!owners.length)return NextResponse.json({ok:false,code:"NOT_FOUND"},{status:404});
   if(viewer===ownerUserId)return NextResponse.json({ok:true,counted:false},{headers:noStore});
  }else{
   const [tenants]=await database().execute<RowDataPacket[]>("SELECT id FROM tenants WHERE slug=? AND status='active' LIMIT 1",[String(body.id)]);
   if(!tenants.length)return NextResponse.json({ok:false,code:"NOT_FOUND"},{status:404});
   tenantId=String(tenants[0].id);
   if(viewer){
    const [own]=await database().execute<RowDataPacket[]>("SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND status='active' LIMIT 1",[tenantId,viewer]);
    if(own.length)return NextResponse.json({ok:true,counted:false},{headers:noStore});
   }
   if(kind==="product"){
    if(!validId(body.productId))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
    resourceId=String(body.productId);
    const [products]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE tenant_id=? AND id=? LIMIT 1",[tenantId,resourceId]);
    if(!products.length)return NextResponse.json({ok:false,code:"NOT_FOUND"},{status:404});
   }
  }
  await recordPublicVisit(kind,tenantId,resourceId,ownerUserId,visitorFingerprint(request,viewer));
  return NextResponse.json({ok:true},{headers:noStore});
 }catch{return NextResponse.json({ok:false,code:"VISIT_UNAVAILABLE"},{status:503,headers:noStore});}
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
 }catch{return NextResponse.json({ok:false,code:"VISITS_UNAVAILABLE"},{status:503,headers:noStore});}
}
