import {NextResponse} from "next/server";
import {destroySession} from "@/lib/auth/session";
import {assertSameOrigin} from "@/lib/security/origin";

export async function POST(request:Request){
 assertSameOrigin(request);
 await destroySession();
 const url=new URL(request.url);
 const appUrl=process.env.APP_URL?.trim();
 const origin=appUrl ? new URL(appUrl).origin : url.origin;
 return NextResponse.redirect(new URL("/login",origin),303);
}