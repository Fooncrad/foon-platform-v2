import {NextResponse} from "next/server";
import {destroySession} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";

export async function POST(request:Request){
 try { assertSameOrigin(request); }
 catch { return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403}); }
 await destroySession();
 const url=new URL(request.url);
 const appUrl=process.env.APP_URL?.trim();
 const origin=appUrl ? new URL(appUrl).origin : url.origin;
 const requestedNext=url.searchParams.get("next")??"";
 const safeNext=/^\\/restaurant\\/display-pair\\?code=\\d{8}$/.test(requestedNext)?requestedNext:null;
 const loginUrl=new URL("/login",origin);
 if(safeNext)loginUrl.searchParams.set("next",safeNext);
 return NextResponse.redirect(loginUrl,303);
}