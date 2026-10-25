import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
const MAX_CMS_BODY_BYTES=2*1024*1024;
async function auth(write:boolean){const user=await currentActiveAdminUserId();if(!user)return {status:401,user:null};try{await requirePlatformRole(user,write?["super_admin","admin"]:["super_admin","admin","support"]);return {status:200,user};}catch{return {status:403,user:null};}}
export async function GET(){
 const a=await auth(false);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});
 try{const [pages]=await database().execute<RowDataPacket[]>("SELECT id,slug,title_ar,title_en,title_fr,body_ar,body_en,body_fr,status,updated_at FROM platform_content_pages ORDER BY updated_at DESC LIMIT 100");return NextResponse.json({ok:true,pages});}
 catch{return NextResponse.json({ok:false,code:"PAGES_UNAVAILABLE"},{status:503});}
}
export async function PUT(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const a=await auth(true);if(a.status!==200)return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:a.status});
 let parsed:unknown;
 try{parsed=await readLimitedJson(request,MAX_CMS_BODY_BYTES);}
 catch(error){const tooLarge=error instanceof Error&&error.message==="BATCH_TOO_LARGE";return NextResponse.json({ok:false,code:tooLarge?"BODY_TOO_LARGE":"INVALID_INPUT"},{status:tooLarge?413:400});}
 if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const b=parsed as Record<string,unknown>;
 if(!b||typeof b.slug!=="string"||!/^[a-z][a-z0-9-]{1,119}$/.test(b.slug)||(b.status!=="draft"&&b.status!=="published")||!["title_ar","title_en","title_fr"].every(k=>typeof b[k]==="string"&&(b[k] as string).trim().length>=2&&(b[k] as string).length<=180)||!["body_ar","body_en","body_fr"].every(k=>typeof b[k]==="string"&&(b[k] as string).length<=100000))return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 const id=typeof b.id==="string"&&/^[a-f0-9-]{36}$/i.test(b.id)?b.id:randomUUID();
 const db=await database().getConnection();
 try{await db.beginTransaction();
  if(b.id){const [found]=await db.execute<RowDataPacket[]>("SELECT id FROM platform_content_pages WHERE id=? FOR UPDATE",[id]);if(!found.length){await db.rollback();return NextResponse.json({ok:false,code:"PAGE_NOT_FOUND"},{status:404});}
   await db.execute("UPDATE platform_content_pages SET slug=?,title_ar=?,title_en=?,title_fr=?,body_ar=?,body_en=?,body_fr=?,status=?,updated_by=? WHERE id=?",[b.slug,b.title_ar,b.title_en,b.title_fr,b.body_ar,b.body_en,b.body_fr,b.status,a.user,id]);}
  else await db.execute("INSERT INTO platform_content_pages(id,slug,title_ar,title_en,title_fr,body_ar,body_en,body_fr,status,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?)",[id,b.slug,b.title_ar,b.title_en,b.title_fr,b.body_ar,b.body_en,b.body_fr,b.status,a.user]);
  await db.execute("INSERT INTO platform_audit_events(actor_user_id,action,target_type,target_id) VALUES (?,?,?,?)",[a.user,"platform.page.saved","platform_page",id]);
  await db.commit();return NextResponse.json({ok:true,id});
 }catch(e){await db.rollback();return NextResponse.json({ok:false,code:(e as {code?:string}).code==="ER_DUP_ENTRY"?"PAGE_SLUG_EXISTS":"PAGE_SAVE_FAILED"},{status:(e as {code?:string}).code==="ER_DUP_ENTRY"?409:503});}finally{db.release();}
}
