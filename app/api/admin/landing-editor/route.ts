import {NextResponse} from "next/server";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {emptyLandingSettings,validateLanding} from "@/lib/platform/landing-fields";
const MAX_CMS_BODY_BYTES=2*1024*1024;
async function access(write:boolean){const id=await currentActiveAdminUserId();if(!id)return {status:401,id:null};try{await requirePlatformRole(id,write?["super_admin","admin"]:["super_admin","admin","support"]);return {status:200,id};}catch{return {status:403,id:null};}}
export async function GET(){const a=await access(false);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});try{const [rows]=await database().execute<RowDataPacket[]>("SELECT status,payload,updated_at FROM platform_landing_content WHERE id IN (1,2) ORDER BY id");let published=emptyLandingSettings(),draft=emptyLandingSettings();for(const r of rows){const parsed=typeof r.payload==="string"?JSON.parse(r.payload):r.payload;if(validateLanding(parsed)){if(r.status==="published")published=parsed;else draft=parsed;}}return NextResponse.json({ok:true,published,draft});}catch{return NextResponse.json({ok:false,code:"CONTENT_UNAVAILABLE"},{status:503});}}
export async function PUT(req:Request){try{assertSameOrigin(req);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}const a=await access(true);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});let parsed:unknown;
try{parsed=await readLimitedJson(req,MAX_CMS_BODY_BYTES);}
catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:tooLarge?413:400});}
if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return NextResponse.json({ok:false,code:"INVALID_CONTENT"},{status:400});
const body=parsed as Record<string,unknown>;
if(!validateLanding(body.content)||(body.status!=="draft"&&body.status!=="published"))return NextResponse.json({ok:false,code:"INVALID_CONTENT"},{status:400});
const content=body.content,status=body.status;const db=await database().getConnection();try{await db.beginTransaction();const id=status==="published"?1:2;await db.execute("INSERT INTO platform_landing_content(id,status,payload,updated_by) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE payload=VALUES(payload),updated_by=VALUES(updated_by),updated_at=CURRENT_TIMESTAMP",[id,status,JSON.stringify(content),a.id]);await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,?,?,?)",[a.id,status==="published"?"platform.landing.published":"platform.landing.drafted","platform_landing",String(id)]);await db.commit();return NextResponse.json({ok:true,status});}catch{await db.rollback();return NextResponse.json({ok:false,code:"CONTENT_SAVE_FAILED"},{status:503});}finally{db.release();}}
