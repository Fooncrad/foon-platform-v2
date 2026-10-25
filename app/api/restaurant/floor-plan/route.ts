import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import {defaultFloorPlan,validFloorPlan} from "@/lib/restaurant/floor-plan";
async function access(req:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=req.headers.get("x-foon-tenant"),branch=new URL(req.url).searchParams.get("branch");
 if(!tenant||!branch)return {error:NextResponse.json({ok:false,code:"BRANCH_REQUIRED"},{status:400})};
 try{const membership=await requireTenantMembership(user,tenant,["owner","manager"],write);if(write)await requireAllAdditionalBranchesUnlocked(membership.tenantId,user);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,membership.tenantId]);
 if(!rows.length)return {error:NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404})};
 return {tenant:membership.tenantId,branch};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
}
export async function GET(req:Request){const ctx=await access(req,false);if(ctx.error)return ctx.error;try{const [rows]=await database().execute<RowDataPacket[]>("SELECT layout_json FROM restaurant_floor_plans WHERE tenant_id=? AND branch_id=? LIMIT 1",[ctx.tenant,ctx.branch]);const raw=rows[0]?.layout_json;const layout=typeof raw==="string"?JSON.parse(raw):raw;return NextResponse.json({ok:true,plan:validFloorPlan(layout)?layout:defaultFloorPlan});}catch{return NextResponse.json({ok:false,code:"FLOOR_PLAN_UNAVAILABLE"},{status:503})}}
export async function PUT(req:Request){try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}const ctx=await access(req,true);if(ctx.error)return ctx.error;const body=await req.json().catch(()=>null);if(!validFloorPlan(body?.plan))return NextResponse.json({ok:false,code:"INVALID_LAYOUT"},{status:400});try{await database().execute("INSERT INTO restaurant_floor_plans(tenant_id,branch_id,layout_json) VALUES (?,?,?) ON DUPLICATE KEY UPDATE layout_json=VALUES(layout_json)",[ctx.tenant,ctx.branch,JSON.stringify(body.plan)]);return NextResponse.json({ok:true})}catch{return NextResponse.json({ok:false,code:"FLOOR_PLAN_SAVE_FAILED"},{status:503})}}
