import {NextRequest,NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace,ACTIVE_TENANT_COOKIE} from "@/lib/tenant/workspace";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {activityWorkspaceUrl} from "@/lib/tenant/workspace-routes";

export async function POST(request:NextRequest){
 const origin=request.headers.get("origin");
 if(origin&&new URL(origin).host!==request.nextUrl.host)return NextResponse.json({code:"FORBIDDEN"},{status:403});
 const userId=await currentUserId();
 if(!userId)return NextResponse.json({code:"UNAUTHORIZED"},{status:401});
 let requested:string;
 try{
  const payload=await request.json();
  requested=typeof payload?.tenantId==="string"?payload.tenantId:"";
 }catch{return NextResponse.json({code:"INVALID_INPUT"},{status:400});}
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requested))
  return NextResponse.json({code:"INVALID_INPUT"},{status:400});
 try{
  const workspace=await resolveWorkspace(userId,requested);
  const activity=await tenantWorkspaceActivity(workspace.tenant_id);
  if(!activity)return NextResponse.json({code:"ACTIVITY_NOT_FOUND"},{status:404});
  const response=NextResponse.json({ok:true,path:activityWorkspaceUrl(activity)});
  response.cookies.set(ACTIVE_TENANT_COOKIE,workspace.tenant_id,{
   httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",
   path:"/",maxAge:60*60*24*30
  });
  return response;
 }catch{
  return NextResponse.json({code:"FORBIDDEN"},{status:403});
 }
}
