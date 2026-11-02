import {randomBytes} from "node:crypto";
import {cookies} from "next/headers";
import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {accountHelpUrl} from "@/lib/auth/public-login-url.mjs";

export const runtime="nodejs";
const COOKIE_PATH="/api/auth/google";
async function begin(request:Request,legalAccepted:boolean,asJson:boolean){
 const clientId=process.env.GOOGLE_CLIENT_ID;
 const clientSecret=process.env.GOOGLE_CLIENT_SECRET;
 const origin=process.env.APP_URL;
 const failure=(code:string)=>asJson?NextResponse.json({ok:false,code},{status:503}):NextResponse.redirect(accountHelpUrl(origin,request.url,code,process.env.NODE_ENV==="production"));
 if(!clientId||!clientSecret||!origin)return failure("GOOGLE_NOT_CONFIGURED");
 // OAuth credentials and switch belong to the platform only.
 try{
  const [flags]=await database().execute<RowDataPacket[]>("SELECT config_value FROM platform_configuration WHERE config_key='google_oauth_enabled' LIMIT 1");
  if(flags[0]?.config_value==="false")return failure("GOOGLE_DISABLED");
 }catch{return failure("GOOGLE_NOT_CONFIGURED");}
 const base=new URL(origin);
 if(base.protocol!=="https:" && process.env.NODE_ENV==="production")return failure("GOOGLE_NOT_CONFIGURED");
 const state=randomBytes(32).toString("base64url");
 const jar=await cookies();
 const store=new URL(request.url).searchParams.get("store")??"";
 const checkoutStore=/^[a-z0-9][a-z0-9-]{0,79}$/.test(store)?store:"";
 jar.set("foon_google_checkout_store",checkoutStore,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:COOKIE_PATH,maxAge:checkoutStore?600:0});
 jar.set("foon_google_oauth_state",state,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:COOKIE_PATH,maxAge:600});
 // An explicit POST is the only route that binds the user's consent to this OAuth state.
 jar.set("foon_google_legal_consent",legalAccepted?state:"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:COOKIE_PATH,maxAge:legalAccepted?600:0});
 const target=new URL("https://accounts.google.com/o/oauth2/v2/auth");
 target.searchParams.set("client_id",clientId);
 target.searchParams.set("redirect_uri",new URL("/api/auth/google/callback",base).toString());
 target.searchParams.set("response_type","code");
 target.searchParams.set("scope","openid email profile");
 target.searchParams.set("state",state);
 target.searchParams.set("prompt","select_account");
 return asJson?NextResponse.json({ok:true,url:target.toString()}):NextResponse.redirect(target);
}
// Existing bookmarked OAuth entry points may sign in existing accounts, but cannot create unconsented ones.
export async function GET(request:Request){return begin(request,false,false);}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null);
 if(!body||body.legalAccepted!==true)return NextResponse.json({ok:false,code:"LEGAL_CONSENT_REQUIRED"},{status:400});
 return begin(request,true,true);
}
