import {NextResponse} from "next/server";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {mailConfiguration} from "@/scripts/mail-provider.mjs";
export const runtime="nodejs";
export async function GET(){
 const user=await currentActiveAdminUserId();
 if(!user)return NextResponse.json({ok:false,code:"UNAUTHORIZED"},{status:401});
 try{await requirePlatformRole(user,["super_admin","admin","support"])}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403})}
 try{
  const cfg=mailConfiguration();
  return NextResponse.json({ok:true,configured:cfg.configured,host:process.env.SMTP_HOST||"smtp.hostinger.com",port:465,secure:true,user:cfg.user,from:cfg.from,fromName:cfg.name,passwordSet:cfg.configured,source:"server_environment"});
 }catch{return NextResponse.json({ok:false,code:"SMTP_CONFIGURATION_INVALID"},{status:503})}
}
