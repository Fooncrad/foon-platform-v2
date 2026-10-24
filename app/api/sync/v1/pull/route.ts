import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {authenticateEnrolledSyncDevice} from "@/lib/platform/bidirectional-sync-device-auth.mjs";
import {handleAuthenticatedSyncPull} from "@/lib/platform/bidirectional-sync-cloud-handler.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const noStore={"Cache-Control":"no-store"};
const reply=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers:noStore});
export async function GET(request:Request){
 if(process.env.FOON_SYNC_PULL_ENABLED!=="true")return reply("FEATURE_DISABLED",404);
 const key=process.env.FOON_SYNC_ED25519_PRIVATE_KEY?.replace(/\\n/g,"\n");
 if(!key)return reply("SYNC_NOT_CONFIGURED",503);
 const auth=request.headers.get("authorization")||"";
 if(!auth.startsWith("Bearer "))return reply("UNAUTHENTICATED",401);
 const credential=auth.slice(7);
 const url=new URL(request.url);
 const tenantId=url.searchParams.get("tenantId")||"";
 const branchId=url.searchParams.get("branchId")||"";
 const after=Number(url.searchParams.get("after")??"0");
 const limit=Number(url.searchParams.get("limit")??"100");
 if(!UUID.test(tenantId)||!UUID.test(branchId)||!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>200)return reply("INVALID_INPUT",400);
 const conn=await database().getConnection();
 try{
  const body=await handleAuthenticatedSyncPull({
   connection:conn,
   credential,
   authenticateDevice:(secret:string)=>authenticateEnrolledSyncDevice(conn,secret),
   request:{tenantId,branchId,after,limit},
   privateKey:key
  });
  return NextResponse.json(body,{headers:noStore});
 }catch(error){
  const code=error instanceof Error?error.message:"";
  if(code==="SYNC_AUTH_REQUIRED"||code==="SYNC_DEVICE_DISABLED"||code==="SYNC_DEVICE_EXPIRED")return reply("UNAUTHENTICATED",401);
  if(code==="SYNC_SCOPE_FORBIDDEN"||code==="SYNC_READ_FORBIDDEN")return reply("FORBIDDEN",403);
  if(code==="SYNC_INVALID_LIMIT"||code==="SYNC_INVALID_CURSOR")return reply("INVALID_INPUT",400);
  return reply("SYNC_UNAVAILABLE",503);
 }finally{conn.release()}
}
