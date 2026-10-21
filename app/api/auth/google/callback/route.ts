import {randomBytes,randomUUID,timingSafeEqual} from "node:crypto";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {hashPassword} from "@/lib/auth/password";
import {createSession} from "@/lib/auth/session";

export const runtime="nodejs";
const fail=(request:Request,code:string)=>NextResponse.redirect(new URL("/login?error="+encodeURIComponent(code),request.url));
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get("code"),incoming=url.searchParams.get("state");
 const jar=await cookies(),saved=jar.get("foon_google_oauth_state")?.value;
 jar.delete("foon_google_oauth_state");
 if(!code||!incoming||!saved||incoming.length!==saved.length||!timingSafeEqual(Buffer.from(incoming),Buffer.from(saved)))return fail(request,"GOOGLE_STATE_INVALID");
 const clientId=process.env.GOOGLE_CLIENT_ID,secret=process.env.GOOGLE_CLIENT_SECRET,appUrl=process.env.APP_URL;
 if(!clientId||!secret||!appUrl)return fail(request,"GOOGLE_NOT_CONFIGURED");
 try{
  const tokenResponse=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:clientId,client_secret:secret,redirect_uri:new URL("/api/auth/google/callback",appUrl).toString(),grant_type:"authorization_code"}),cache:"no-store"});
  if(!tokenResponse.ok)return fail(request,"GOOGLE_AUTH_FAILED");
  const tokens=await tokenResponse.json() as {id_token?:string};
  if(!tokens.id_token)return fail(request,"GOOGLE_AUTH_FAILED");
  const identityResponse=await fetch("https://oauth2.googleapis.com/tokeninfo?id_token="+encodeURIComponent(tokens.id_token),{cache:"no-store"});
  if(!identityResponse.ok)return fail(request,"GOOGLE_AUTH_FAILED");
  const identity=await identityResponse.json() as {aud?:string;iss?:string;sub?:string;email?:string;email_verified?:string;name?:string};
  if(identity.aud!==clientId||!["accounts.google.com","https://accounts.google.com"].includes(identity.iss??"")||identity.email_verified!=="true"||!identity.sub||!identity.email)return fail(request,"GOOGLE_AUTH_FAILED");
  const email=identity.email.trim().toLowerCase();
  if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return fail(request,"GOOGLE_AUTH_FAILED");
  const db=await database().getConnection();
  let userId:string;
  try{
   await db.beginTransaction();
   const [linked]=await db.execute<RowDataPacket[]>("SELECT user_id FROM auth_google_identities WHERE google_sub=? LIMIT 1 FOR UPDATE",[identity.sub]);
   if(linked[0]){
    userId=String(linked[0].user_id);
    const [valid]=await db.execute<RowDataPacket[]>("SELECT status FROM users WHERE id=? LIMIT 1",[userId]);
    if(valid[0]?.status!=="active"){await db.rollback();return fail(request,"GOOGLE_ACCOUNT_DISABLED");}
   }else{
    const [matched]=await db.execute<RowDataPacket[]>("SELECT id,status FROM users WHERE email=? LIMIT 1 FOR UPDATE",[email]);
    if(matched[0]){
     if(matched[0].status!=="active"){await db.rollback();return fail(request,"GOOGLE_ACCOUNT_DISABLED");}
     userId=String(matched[0].id);
    }else{
     userId=randomUUID();
     const passwordHash=await hashPassword(randomBytes(48).toString("base64url"));
     await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?,?)",[userId,email,passwordHash,(identity.name??email.split("@")[0]).slice(0,180),"active"]);
    }
    await db.execute("INSERT INTO auth_google_identities(google_sub,user_id,email_at_link) VALUES (?,?,?)",[identity.sub,userId,email]);
   }
   await createSession(userId,db);
   await db.commit();
  }catch(error){await db.rollback();throw error;}finally{db.release();}
  return NextResponse.redirect(new URL("/account",appUrl));
 }catch{return fail(request,"GOOGLE_AUTH_UNAVAILABLE");}
}
