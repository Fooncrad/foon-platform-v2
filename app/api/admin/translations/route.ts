import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
async function authorize(write:boolean){const user=await currentActiveAdminUserId();if(!user)return 401;try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return 200;}catch{return 403;}}
export async function GET(request:Request){
 const status=await authorize(false);if(status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status});
 const url=new URL(request.url),q=(url.searchParams.get("q")??"").trim().slice(0,100),page=Math.max(1,Math.min(100000,Number(url.searchParams.get("page"))||1));
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT translation_key,text_ar,text_en,text_fr FROM ui_translations WHERE translation_key LIKE ? OR text_ar LIKE ? OR text_en LIKE ? OR text_fr LIKE ? ORDER BY translation_key LIMIT 50 OFFSET ?",[...Array(4).fill("%"+q+"%"),(page-1)*50]);return NextResponse.json({ok:true,rows,page});}catch{return NextResponse.json({ok:false,code:"TRANSLATIONS_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const status=await authorize(true);if(status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status});
 const b=await request.json().catch(()=>null);
 if(!b||typeof b.translation_key!=="string"||!/^[-a-zA-Z0-9_.:]{1,191}$/.test(b.translation_key)||!["text_ar","text_en","text_fr"].every(k=>typeof b[k]==="string"&&b[k].length<=10000))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 try{await database().execute("INSERT INTO ui_translations(translation_key,text_ar,text_en,text_fr) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE text_ar=VALUES(text_ar),text_en=VALUES(text_en),text_fr=VALUES(text_fr)",[b.translation_key,b.text_ar,b.text_en,b.text_fr]);return NextResponse.json({ok:true});}catch{return NextResponse.json({ok:false,code:"TRANSLATION_SAVE_FAILED"},{status:503});}
}
