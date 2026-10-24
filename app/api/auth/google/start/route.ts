import {randomBytes} from "node:crypto";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";

export const runtime="nodejs";
export async function GET(request:Request){
 const clientId=process.env.GOOGLE_CLIENT_ID;
 const clientSecret=process.env.GOOGLE_CLIENT_SECRET;
 const origin=process.env.APP_URL;
 if(!clientId||!clientSecret||!origin)return NextResponse.redirect(new URL("/login?error=GOOGLE_NOT_CONFIGURED",request.url));
 // Only platform administrators can configure OAuth. Tenants must never supply keys.
 try{
  const [flags]=await database().execute<RowDataPacket[]>("SELECT config_value FROM platform_configuration WHERE config_key='google_oauth_enabled' LIMIT 1");
  if(flags[0]?.config_value==="false")return NextResponse.redirect(new URL("/login?error=GOOGLE_DISABLED",request.url));
 }catch{return NextResponse.redirect(new URL("/login?error=GOOGLE_NOT_CONFIGURED",request.url));}
 const base=new URL(origin);
 if(base.protocol!=="https:" && process.env.NODE_ENV==="production")return NextResponse.redirect(new URL("/login?error=GOOGLE_NOT_CONFIGURED",request.url));
 const state=randomBytes(32).toString("base64url");
 const jar=await cookies();
 jar.set("foon_google_oauth_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/api/auth/google",maxAge:600});
 const target=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 target.searchParams.set("client_id",clientId);
 target.searchParams.set("redirect_uri",new URL("/api/auth/google/callback",base).toString());
 target.searchParams.set("response_type","code");
 target.searchParams.set("scope","openid email profile");
 target.searchParams.set("state",state);
 target.searchParams.set("prompt","select_account");
 return NextResponse.redirect(target);
}
