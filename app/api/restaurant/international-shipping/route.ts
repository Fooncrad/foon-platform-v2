import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {supportedCountries} from "@/lib/tenant/country-catalog";
import {normalizeForeignCountries} from "@/lib/tenant/international-shipping-validation.mjs";
import {internationalEligible,internationalShipping} from "@/lib/tenant/international-shipping";
const supportedCountryCodes=new Set<string>(supportedCountries.map(c=>c.code));
async function scope(request:Request){const user=await currentUserId();if(!user)return null;try{const {tenantId}=await requireTenantMembership(user,request.headers.get("x-foon-tenant")??"",["owner","manager"]);return {user,tenantId}}catch{return null}}
export async function GET(request:Request){
 const ctx=await scope(request);if(!ctx)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});
 const [rows]=await database().execute<RowDataPacket[]>("SELECT activity_code,country_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
 const activity=String(rows[0]?.activity_code??"");return NextResponse.json({ok:true,eligible:internationalEligible(activity),merchantCountry:String(rows[0]?.country_code??""),shipping:await internationalShipping(ctx.tenantId)});
}
export async function POST(request:Request){
 try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const ctx=await scope(request);if(!ctx)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});
 try{await requireAllAdditionalBranchesUnlocked(ctx.tenantId,ctx.user);}catch{return NextResponse.json({ok:false,code:"BRANCH_PIN_REQUIRED"},{status:403});}
 let body:unknown;
 try{body=await readLimitedJson(request,2048);}catch(error){const code=error instanceof Error?error.message:"";return NextResponse.json({ok:false,code:code==="BATCH_TOO_LARGE"?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:code==="BATCH_TOO_LARGE"?413:400});}
 if(!body||typeof body!=="object"||Array.isArray(body))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const countries=(body as {countries?:unknown}).countries;
 if(!Array.isArray(countries))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const db=database();const [rows]=await db.execute<RowDataPacket[]>("SELECT activity_code,country_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[ctx.tenantId]);
 if(!internationalEligible(String(rows[0]?.activity_code??"")))return NextResponse.json({ok:false,code:"NOT_ELIGIBLE"},{status:403});
 const merchantCountry=String(rows[0]?.country_code??"").toUpperCase();
 const desired=normalizeForeignCountries(countries,merchantCountry,supportedCountryCodes);
 if(!desired)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 if(!desired.length)return NextResponse.json({ok:false,code:"NO_FOREIGN_COUNTRIES"},{status:400});
 await db.execute("INSERT INTO tenant_international_shipping(tenant_id,status,requested_countries,approved_countries,reviewed_by,reviewed_at) VALUES (?,'pending',?,NULL,NULL,NULL) ON DUPLICATE KEY UPDATE status='pending',requested_countries=VALUES(requested_countries),approved_countries=NULL,reviewed_by=NULL,reviewed_at=NULL",[ctx.tenantId,JSON.stringify(desired)]);
 return NextResponse.json({ok:true,status:"pending",message:"يرجى مراسلة أدمن المنصة لاعتماد البيع خارج دولة المتجر."});
}
