import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
export const runtime="nodejs";
async function authorize(request:Request){
 const user=await currentUserId();
 const tenant=request.headers.get("x-foon-tenant");
 if(!user||!tenant)return null;
 try{
  const ctx=await requireTenantMembership(user,tenant,["owner","manager"],request.method!=="GET");
  return ctx.tenantId;
 }catch{return null}
}
export async function GET(request:Request){
 const tenant=await authorize(request);if(!tenant)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});
 const product=new URL(request.url).searchParams.get("product");
 if(!product)return NextResponse.json({ok:false,code:"PRODUCT_REQUIRED"},{status:400});
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,image_url,alt_ar,sort_order FROM catalog_images WHERE tenant_id=? AND product_id=? ORDER BY sort_order,id",[tenant,product]);
 return NextResponse.json({ok:true,images:rows});
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const tenant=await authorize(request);if(!tenant)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});
 const body=await request.json().catch(()=>null);
 if(!body||typeof body.product!=="string"||typeof body.url!=="string"||body.url.length>1024)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 let url:URL;
 try{url=new URL(body.url)}catch{return NextResponse.json({ok:false,code:"INVALID_URL"},{status:400})}
 if(url.protocol!=="https:"||url.username||url.password)return NextResponse.json({ok:false,code:"HTTPS_IMAGE_REQUIRED"},{status:400});
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM catalog_products WHERE id=? AND tenant_id=? LIMIT 1",[body.product,tenant]);
 if(!rows.length)return NextResponse.json({ok:false,code:"PRODUCT_NOT_FOUND"},{status:404});
 const id=randomUUID();
 await database().execute("INSERT INTO catalog_images(id,tenant_id,product_id,image_url,alt_ar) VALUES (?,?,?,?,?)",[id,tenant,body.product,url.toString(),typeof body.alt==="string"?body.alt.slice(0,250):null]);
 return NextResponse.json({ok:true,id},{status:201});
}
export async function DELETE(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const tenant=await authorize(request);if(!tenant)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});
 const body=await request.json().catch(()=>null);
 if(typeof body?.id!=="string")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const [result]=await database().execute("DELETE FROM catalog_images WHERE tenant_id=? AND id=?",[tenant,body.id]);
 const deleted=(result as {affectedRows?:number}).affectedRows??0;
 if(!deleted)return NextResponse.json({ok:false,code:"IMAGE_NOT_FOUND"},{status:404});
 return NextResponse.json({ok:true,deleted});
}
