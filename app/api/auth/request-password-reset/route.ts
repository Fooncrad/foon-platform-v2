import {NextResponse} from "next/server";
import {assertSameOrigin} from "@/lib/security/origin";

export const runtime="nodejs";
/**
 * Password recovery must never claim a reset link was sent unless a token
 * was persisted and a configured mail transport accepted the message.
 * Until the secure token + mail flow is installed, fail explicitly.
 */
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 const body=await request.json().catch(()=>null);
 const email=typeof body?.email==="string"?body.email.trim().toLowerCase():"";
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
  return NextResponse.json({ok:false,code:"INVALID_EMAIL"},{status:400});
 }
 return NextResponse.json({ok:false,code:"PASSWORD_RESET_NOT_CONFIGURED"},{status:503});
}
