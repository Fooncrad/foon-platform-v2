import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {requireAllAdditionalBranchesUnlocked} from "@/lib/restaurant/branch-pin";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {defaultFloorPlan,validFloorPlan} from "@/lib/restaurant/floor-plan";
const uuid=/^[a-f0-9-]{36}$/i;
async function scope(req:Request,write:boolean){
 const user=await currentUserId();if(!user)return {error:NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401})};
 const tenant=req.headers.get("x-foon-tenant"),branch=new URL(req.url).searchParams.get("branch");
 if(!tenant||!branch)return {error:NextResponse.json({ok:false,code:"BRANCH_REQUIRED"},{status:400})};
 try{const membership=await requireTenantMembership(user,tenant,["owner","manager"],write);
 if(write)await requireAllAdditionalBranchesUnlocked(membership.tenantId,user);
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",[branch,membership.tenantId]);
 if(!rows.length)return {error:NextResponse.json({ok:false,code:"BRANCH_NOT_FOUND"},{status:404})};
 return {tenant:membership.tenantId,branch};
 }catch{return {error:NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}}
}
function decode(value:unknown){try{const x=typeof value==="string"?JSON.parse(value):value;return validFloorPlan(x)?x:null}catch{return null}}
async function sectionExists(tenant:string,branch:string,section:string){
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id FROM restaurant_resources WHERE tenant_id=? AND id=? AND kind='dining_section' AND archived=FALSE AND status='active' AND (branch_id=? OR branch_id IS NULL) LIMIT 1",[tenant,section,branch]);return rows.length>0;
}
export async function GET(req:Request){const c=await scope(req,false);if(c.error)return c.error;
 try{
 const [sections]=await database().execute<RowDataPacket[]>("SELECT id,name FROM restaurant_resources WHERE tenant_id=? AND kind='dining_section' AND archived=FALSE AND status='active' AND (branch_id=? OR branch_id IS NULL) ORDER BY name LIMIT 200",[c.tenant,c.branch]);
 const [layouts]=await database().execute<RowDataPacket[]>("SELECT id,section_id,name,layout_json FROM restaurant_floor_plan_layouts WHERE tenant_id=? AND branch_id=? ORDER BY created_at,id LIMIT 500",[c.tenant,c.branch]);
 const items=[];for(const l of layouts){const plan=decode(l.layout_json);if(!plan)return NextResponse.json({ok:false,code:"FLOOR_LAYOUT_INVALID"},{status:409});items.push({id:String(l.id),sectionId:String(l.section_id),name:String(l.name),plan})}
 const [legacy]=await database().execute<RowDataPacket[]>("SELECT layout_json FROM restaurant_floor_plans WHERE tenant_id=? AND branch_id=? LIMIT 1",[c.tenant,c.branch]);
 let legacyPlan=null;if(legacy.length){legacyPlan=decode(legacy[0].layout_json);if(!legacyPlan)return NextResponse.json({ok:false,code:"LEGACY_LAYOUT_INVALID"},{status:409})}
 return NextResponse.json({ok:true,sections:sections.map(s=>({id:String(s.id),name:String(s.name)})),layouts:items,legacyPlan},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({ok:false,code:"LAYOUTS_UNAVAILABLE"},{status:503})}}
export async function POST(req:Request){try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const c=await scope(req,true);if(c.error)return c.error;let input:unknown;try{input=await readLimitedJson(req,131072)}catch{return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400})}
 if(!input||typeof input!=="object")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const b=input as Record<string,unknown>;if(typeof b.sectionId!=="string"||!uuid.test(b.sectionId)||typeof b.name!=="string"||!b.name.trim()||b.name.length>120||!validFloorPlan(b.plan))return NextResponse.json({ok:false,code:"INVALID_LAYOUT"},{status:400});
 try{if(!await sectionExists(c.tenant!,c.branch!,b.sectionId))return NextResponse.json({ok:false,code:"SECTION_NOT_FOUND"},{status:404});
 const id=randomUUID();await database().execute("INSERT INTO restaurant_floor_plan_layouts(id,tenant_id,branch_id,section_id,name,layout_json) VALUES (?,?,?,?,?,?)",[id,c.tenant,c.branch,b.sectionId,b.name.trim(),JSON.stringify(b.plan)]);return NextResponse.json({ok:true,id},{status:201})
 }catch{return NextResponse.json({ok:false,code:"LAYOUT_SAVE_FAILED"},{status:503})}}
export async function PUT(req:Request){try{assertSameOrigin(req)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 const c=await scope(req,true);if(c.error)return c.error;let input:unknown;try{input=await readLimitedJson(req,131072)}catch{return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400})}
 if(!input||typeof input!=="object")return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const b=input as Record<string,unknown>;if(typeof b.id!=="string"||!uuid.test(b.id)||typeof b.sectionId!=="string"||!uuid.test(b.sectionId)||typeof b.name!=="string"||!b.name.trim()||b.name.length>120||!validFloorPlan(b.plan))return NextResponse.json({ok:false,code:"INVALID_LAYOUT"},{status:400});
 try{if(!await sectionExists(c.tenant!,c.branch!,b.sectionId))return NextResponse.json({ok:false,code:"SECTION_NOT_FOUND"},{status:404});
 const [result]=await database().execute<import("mysql2").ResultSetHeader>("UPDATE restaurant_floor_plan_layouts SET section_id=?,name=?,layout_json=? WHERE id=? AND tenant_id=? AND branch_id=?",[b.sectionId,b.name.trim(),JSON.stringify(b.plan),b.id,c.tenant,c.branch]);
 return result.affectedRows?NextResponse.json({ok:true}):NextResponse.json({ok:false,code:"LAYOUT_NOT_FOUND"},{status:404})
 }catch{return NextResponse.json({ok:false,code:"LAYOUT_SAVE_FAILED"},{status:503})}}
