import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";
import { assertSameOrigin } from "@/lib/security/origin";

type Context={params:Promise<{id:string}>};
export async function GET(_request:Request,context:Context){
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin","support"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {id}=await context.params;
 if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{const [prices]=await database().execute<RowDataPacket[]>("SELECT id,billing_cycle,currency,price,enabled FROM package_plan_prices WHERE plan_id=? ORDER BY currency,billing_cycle",[id]);return NextResponse.json({ok:true,prices});}
 catch{return NextResponse.json({ok:false,code:"PRICES_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request,context:Context){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const actor=await currentActiveAdminUserId();if(!actor)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(actor,["super_admin","admin"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const {id}=await context.params;
 const body=await request.json().catch(()=>null);
 if(!body||typeof body!=="object"||Array.isArray(body)||!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const cycle=body.billing_cycle,currency=body.currency,rawPrice=body.price;
 const price=typeof rawPrice==="number"?rawPrice:Number(rawPrice);
 if(!["monthly","yearly"].includes(cycle)||typeof currency!=="string"||!/^[A-Z]{3}$/.test(currency)||!Number.isFinite(price)||price<0||price>9999999999.99||Math.round(price*100)/100!==price||typeof body.enabled!=="boolean")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{
  const [plans]=await database().execute<RowDataPacket[]>("SELECT id FROM package_plans WHERE id=? LIMIT 1",[id]);
  if(!plans.length)return NextResponse.json({ok:false,code:"PLAN_NOT_FOUND"},{status:404});
  await database().execute("INSERT INTO package_plan_prices(id,plan_id,billing_cycle,currency,price,enabled) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE price=VALUES(price),enabled=VALUES(enabled)",[randomUUID(),id,cycle,currency,price,body.enabled]);
  return NextResponse.json({ok:true});
 }catch{return NextResponse.json({ok:false,code:"PRICE_SAVE_UNAVAILABLE"},{status:503});}
}
