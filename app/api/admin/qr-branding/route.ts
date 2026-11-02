import {NextResponse} from "next/server";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {defaultQrBranding,parseQrBranding} from "@/lib/platform/qr-branding";
async function access(write:boolean){const user=await currentActiveAdminUserId();if(!user)return 401;try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return 200}catch{return 403}}
export async function GET(){const status=await access(false);if(status!==200)return NextResponse.json({ok:false},{status});try{const [rows]=await database().execute<RowDataPacket[]>("SELECT settings FROM platform_qr_branding WHERE id=1 LIMIT 1");const raw=rows[0]?.settings;return NextResponse.json({ok:true,settings:parseQrBranding(typeof raw==="string"?JSON.parse(raw):raw)??defaultQrBranding})}catch{return NextResponse.json({ok:false,code:"QR_UNAVAILABLE"},{status:503})}}
export async function PUT(request:Request){try{assertSameOrigin(request)}catch{return NextResponse.json({ok:false},{status:403})}const status=await access(true);if(status!==200)return NextResponse.json({ok:false},{status});const body=await request.json().catch(()=>null);const settings=parseQrBranding(body?.settings);if(!settings)return NextResponse.json({ok:false,code:"INVALID_QR"},{status:400});try{await database().execute("INSERT INTO platform_qr_branding(id,settings) VALUES (1,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)",[JSON.stringify(settings)]);return NextResponse.json({ok:true,settings})}catch{return NextResponse.json({ok:false,code:"QR_SAVE_FAILED"},{status:503})}}
