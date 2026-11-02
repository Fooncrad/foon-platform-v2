import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
async function role(){
 const user=await currentActiveAdminUserId();if(!user)return null;
 try{await requirePlatformRole(user,["super_admin","admin"]);return user}catch{return null}
}
export async function GET(){
 if(!await role())return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});
 const [rows]=await database().execute<RowDataPacket[]>("SELECT s.tenant_id,s.status,s.requested_countries,s.approved_countries,s.requested_at,t.name,t.slug,p.country_code,p.activity_code FROM tenant_international_shipping s JOIN tenants t ON t.id=s.tenant_id JOIN tenant_business_profiles p ON p.tenant_id=t.id ORDER BY CASE s.status WHEN 'pending' THEN 0 ELSE 1 END,s.updated_at DESC LIMIT 200");
 return NextResponse.json({ok:true,requests:rows});
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const user=await role();if(!user)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});
 const body=await request.json().catch(()=>null);
 if(typeof body?.tenantId!=="string"||!/^[a-f0-9-]{36}$/i.test(body.tenantId)||!["approved","rejected","disabled"].includes(body.status))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=database();
 const [rows]=await db.execute<RowDataPacket[]>("SELECT s.status,s.requested_countries,p.country_code,p.activity_code FROM tenant_international_shipping s JOIN tenant_business_profiles p ON p.tenant_id=s.tenant_id WHERE s.tenant_id=? LIMIT 1",[body.tenantId]);
 if(!rows.length||["restaurant","cafe"].includes(String(rows[0].activity_code)))return NextResponse.json({ok:false,code:"NOT_ELIGIBLE"},{status:403});
 if(body.status==="approved"&&rows[0].status!=="pending")return NextResponse.json({ok:false,code:"NO_PENDING_REQUEST"},{status:409});
 const requested=typeof rows[0].requested_countries==="string"?JSON.parse(rows[0].requested_countries):rows[0].requested_countries;
 const valid=Array.isArray(requested)?requested.filter((c:unknown)=>typeof c==="string"&&/^[A-Z]{2}$/.test(c)&&c!==String(rows[0].country_code)).slice(0,80):[];
 if(body.status==="approved"&&!valid.length)return NextResponse.json({ok:false,code:"INVALID_DESTINATIONS"},{status:400});
 await db.execute("UPDATE tenant_international_shipping SET status=?,approved_countries=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP() WHERE tenant_id=?",[body.status,body.status==="approved"?JSON.stringify(valid):null,user,body.tenantId]);
 return NextResponse.json({ok:true,status:body.status,approvedCountries:body.status==="approved"?valid:[]});
}
