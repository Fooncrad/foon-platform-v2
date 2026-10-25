import {randomBytes,randomUUID} from "node:crypto";
import {dispatchNotifications} from "@/lib/notifications/dispatch";
import {queueLoginAlert} from "@/lib/auth/login-alert";
import {GOOGLE_OAUTH_COOKIE_PATH,validGoogleOauthState,canUseGoogleLinkedAccount} from "@/lib/auth/google-oauth-security.mjs";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {hashPassword} from "@/lib/auth/password";
import {createSession} from "@/lib/auth/session";
import {accountMembershipRestriction} from "@/lib/auth/account-login-policy";
import {accountHelpUrl,publicLoginOrigin} from "@/lib/auth/public-login-url.mjs";

export const runtime="nodejs";
const fail=(request:Request,code:string)=>NextResponse.redirect(accountHelpUrl(process.env.APP_URL,request.url,code,process.env.NODE_ENV==="production"));
export async function GET(request:Request){
 const url=new URL(request.url),code=url.searchParams.get("code"),incoming=url.searchParams.get("state");
 const jar=await cookies(),saved=jar.get("foon_google_oauth_state")?.value;
 const legalConsentState=jar.get("foon_google_legal_consent")?.value;
 const store=jar.get("foon_google_checkout_store")?.value??"";
 const checkoutStore=/^[a-z0-9][a-z0-9-]{0,79}$/.test(store)?store:"";
 jar.set("foon_google_checkout_store","",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:GOOGLE_OAUTH_COOKIE_PATH,maxAge:0});
 jar.set("foon_google_oauth_state","",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:GOOGLE_OAUTH_COOKIE_PATH,maxAge:0});
 jar.set("foon_google_legal_consent","",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:GOOGLE_OAUTH_COOKIE_PATH,maxAge:0});
 if(!code||!validGoogleOauthState(incoming,saved))return fail(request,"GOOGLE_STATE_INVALID");
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
   const [googleFlags]=await db.execute<RowDataPacket[]>("SELECT config_value FROM platform_configuration WHERE config_key='google_oauth_enabled' LIMIT 1");
   if(googleFlags[0]?.config_value==="false"){await db.rollback();return fail(request,"GOOGLE_DISABLED");}
   const [linked]=await db.execute<RowDataPacket[]>("SELECT user_id FROM auth_google_identities WHERE google_sub=? LIMIT 1 FOR UPDATE",[identity.sub]);
   if(linked[0]){
    userId=String(linked[0].user_id);
    const [valid]=await db.execute<RowDataPacket[]>("SELECT status,email_verified_at FROM users WHERE id=? LIMIT 1 FOR UPDATE",[userId]);
    if(!canUseGoogleLinkedAccount(valid[0])){await db.rollback();return fail(request,valid[0]?.status==="suspended"?"ACCOUNT_SUSPENDED":valid[0]?.status==="pending"?"ACCOUNT_PENDING":"GOOGLE_ACCOUNT_DISABLED");}
   }else{
    const [matched]=await db.execute<RowDataPacket[]>("SELECT id,status,email_verified_at FROM users WHERE email=? LIMIT 1 FOR UPDATE",[email]);
    if(matched[0]){
     if(!canUseGoogleLinkedAccount(matched[0])){await db.rollback();return fail(request,matched[0]?.status==="suspended"?"ACCOUNT_SUSPENDED":matched[0]?.status==="pending"?"ACCOUNT_PENDING":"GOOGLE_ACCOUNT_DISABLED");}
     userId=String(matched[0].id);
    }else{
     if(!validGoogleOauthState(incoming,legalConsentState)){await db.rollback();return fail(request,"GOOGLE_LEGAL_CONSENT_REQUIRED");}
     userId=randomUUID();
     const passwordHash=await hashPassword(randomBytes(48).toString("base64url"));
     await db.execute("INSERT INTO users(id,email,password_hash,display_name,status,email_verified_at) VALUES (?,?,?,?,?,NOW())",[userId,email,passwordHash,(identity.name??email.split("@")[0]).slice(0,180),"active"]);
     await db.execute("UPDATE users SET legal_accepted_at=NOW() WHERE id=?",[userId]);
    }
    await db.execute("INSERT INTO auth_google_identities(google_sub,user_id,email_at_link) VALUES (?,?,?)",[identity.sub,userId,email]);
   }
   const restriction=await accountMembershipRestriction(db,userId);
   if(restriction){await db.rollback();return fail(request,restriction);}
   await createSession(userId,db);
   await db.commit();
  }catch(error){await db.rollback();throw error;}finally{db.release();}
  if(await queueLoginAlert(database(),userId,request,"google"))dispatchNotifications();
  return NextResponse.redirect(new URL(checkoutStore?"/"+checkoutStore+"?checkout=google#menu-cart":"/account",publicLoginOrigin(appUrl,request.url,process.env.NODE_ENV==="production")));
 }catch{return fail(request,"GOOGLE_AUTH_UNAVAILABLE");}
}
