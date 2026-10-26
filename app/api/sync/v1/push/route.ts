import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {authenticateEnrolledSyncDevice} from "@/lib/platform/bidirectional-sync-device-auth.mjs";
import {handleAuthenticatedSyncPush} from "@/lib/platform/bidirectional-sync-cloud-handler.mjs";
import {applyScopedInventoryMovement,validateInventoryMovement} from "@/lib/platform/bidirectional-sync-inventory.mjs";
import {readBoundedSyncRequestText} from "@/lib/platform/bidirectional-sync-bounded-body.mjs";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"no-store"};
const reply=(code:string,status:number)=>NextResponse.json({ok:false,code},{status,headers:noStore});
export async function POST(request:Request){
 // Entire route is OFF until the isolated migration and real integration tests pass.
 if(process.env.FOON_SYNC_PUSH_ENABLED!=="true")return reply("FEATURE_DISABLED",404);
 // Device-to-server bearer requests have no browser Origin; reject a mismatched Origin if supplied.
 const origin=request.headers.get("origin");
 if(origin){try{if(origin!==new URL(process.env.APP_URL||"").origin)return reply("FORBIDDEN",403)}catch{return reply("FORBIDDEN",403)}}
 const key=process.env.FOON_SYNC_ED25519_PRIVATE_KEY?.replace(/\\n/g,"\n");
 if(!key)return reply("SYNC_NOT_CONFIGURED",503);
 const bearer=request.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return reply("UNAUTHENTICATED",401);
 // Bound streamed/chunked uploads before buffering JSON in memory.
 let raw:string;
 try{raw=await readBoundedSyncRequestText(request,300_000)}
 catch(error){
  if(error instanceof Error&&error.message==="SYNC_PAYLOAD_TOO_LARGE")return reply("PAYLOAD_TOO_LARGE",413);
  return reply("INVALID_INPUT",400);
 }
 let body:unknown;try{body=JSON.parse(raw)}catch{return reply("INVALID_INPUT",400)}
 if(!body||typeof body!=="object"||!("change" in body))return reply("INVALID_INPUT",400);
 const change=(body as {change:unknown}).change;
 // Deliberately no merchant stock/orders adapter: only isolated staging projection.
 try{validateInventoryMovement(change)}catch{return reply("UNSUPPORTED_ENTITY",422)}
 const conn=await database().getConnection();
 try{
  const response=await handleAuthenticatedSyncPush({
   connection:conn,credential:bearer.slice(7),
   authenticateDevice:(credential:string)=>authenticateEnrolledSyncDevice(conn,credential),
   change,applyBusinessChange:applyScopedInventoryMovement,privateKey:key
  });
  return NextResponse.json(response,{status:response.ok?200:409,headers:noStore});
 }catch(error){
  const code=error instanceof Error?error.message:"";
  if(["SYNC_AUTH_REQUIRED","SYNC_DEVICE_DISABLED","SYNC_DEVICE_EXPIRED"].includes(code))return reply("UNAUTHENTICATED",401);
  if(["SYNC_SCOPE_FORBIDDEN","SYNC_WRITE_FORBIDDEN"].includes(code))return reply("FORBIDDEN",403);
  if(code==="SYNC_INVENTORY_NOT_PROVISIONED")return reply("INVENTORY_NOT_PROVISIONED",409);
  if(code==="SYNC_IDEMPOTENCY_CONFLICT")return reply("IDEMPOTENCY_CONFLICT",409);
  return reply("SYNC_UNAVAILABLE",503);
 }finally{conn.release()}
}
