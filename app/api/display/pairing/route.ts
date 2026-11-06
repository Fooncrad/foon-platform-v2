import {createHash,randomBytes,randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let body:Record<string,unknown>;
 try{body=await readLimitedJson(req,1024) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 try{
  if(body.action==="start"){
   for(let attempt=0;attempt<5;attempt++){
    const code=String(randomBytes(4).readUInt32BE(0)%100000000).padStart(8,"0");
    const token=randomBytes(32).toString("base64url");
    try{
     await database().execute("INSERT INTO display_pairing_sessions(id,code_hash,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 10 MINUTE))",[randomUUID(),digest(code),digest(token)]);
     const origin=new URL(req.url).origin;
     return reply({ok:true,code,token,expiresInSeconds:600,pairUrl:origin+"/restaurant/display-pair?code="+code},201);
    }catch(error){
     if(attempt===4)throw error;
    }
   }
  }
  if(body.action==="status"){
   const token=typeof body.token==="string"?body.token:"";
   if(!/^[A-Za-z0-9_-]{32,80}$/.test(token))return reply({ok:false,code:"INVALID_PAIRING_TOKEN"},400);
   const [rows]=await database().execute<RowDataPacket[]>("SELECT claimed_screen_id FROM display_pairing_sessions WHERE token_hash=? AND (expires_at>UTC_TIMESTAMP() OR claimed_screen_id IS NOT NULL) LIMIT 1",[digest(token)]);
   if(!rows.length)return reply({ok:false,code:"PAIRING_EXPIRED"},410);
   return reply({ok:true,claimed:Boolean(rows[0].claimed_screen_id)});
  }
  return reply({ok:false,code:"INVALID_ACTION"},400);
 }catch{return reply({ok:false,code:"DISPLAY_PAIRING_UNAVAILABLE"},503);}
}
