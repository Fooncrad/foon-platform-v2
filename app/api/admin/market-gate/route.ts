import {NextResponse} from "next/server";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {database} from "@/lib/db/mysql";
import {parseMarketGate,readMarketGate} from "@/lib/market/global-gate";
async function authorize(write:boolean){const user=await currentActiveAdminUserId();if(!user)return {status:401,user:null};try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return {status:200,user};}catch{return {status:403,user:null}}}
export async function GET(){const a=await authorize(false);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});return NextResponse.json({ok:true,settings:await readMarketGate()},{headers:{"Cache-Control":"no-store"}})}
export async function PUT(request:Request){try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}const a=await authorize(true);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});let parsed:unknown;
try{parsed=await readLimitedJson(request,4096)}catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:tooLarge?413:400})}
const body=parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed as Record<string,unknown>:null;
const value=parseMarketGate(body?.settings);if(!value)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});const db=await database().getConnection();try{await db.beginTransaction();await db.execute("INSERT INTO platform_configuration(config_key,config_value,updated_by) VALUES ('market_global_gate',?,?) ON DUPLICATE KEY UPDATE config_value=VALUES(config_value),updated_by=VALUES(updated_by)",[JSON.stringify(value),a.user]);await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,?,?,?)",[a.user,value.closed?"platform.market.closed":"platform.market.opened","market","global"]);await db.commit();return NextResponse.json({ok:true,settings:value},{headers:{"Cache-Control":"no-store"}})}catch{await db.rollback();return NextResponse.json({ok:false,code:"MARKET_GATE_SAVE_FAILED"},{status:503})}finally{db.release()}}
