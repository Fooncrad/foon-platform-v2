import {createHash} from "node:crypto";
import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
type PlayerHealthReport={
 platform:"windows"|"linux"|"android"|"macos"|"ios"|"other";
 playerVersion:string;
 viewportWidth:number;
 viewportHeight:number;
 online:boolean;
 visible:boolean;
 h264:boolean;
 webm:boolean;
 playbackState:"playing"|"idle"|"error";
 errorCode:string|null;
};
const allowedPlatforms=new Set<PlayerHealthReport["platform"]>(["windows","linux","android","macos","ios","other"]);
function validReport(value:unknown):value is PlayerHealthReport{
 if(!value||typeof value!=="object"||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return typeof v.platform==="string"&&allowedPlatforms.has(v.platform as PlayerHealthReport["platform"])&&
  typeof v.playerVersion==="string"&&v.playerVersion.length<=64&&
  typeof v.viewportWidth==="number"&&Number.isInteger(v.viewportWidth)&&v.viewportWidth>=0&&v.viewportWidth<=16384&&
  typeof v.viewportHeight==="number"&&Number.isInteger(v.viewportHeight)&&v.viewportHeight>=0&&v.viewportHeight<=16384&&
  typeof v.online==="boolean"&&typeof v.visible==="boolean"&&
  typeof v.h264==="boolean"&&typeof v.webm==="boolean"&&
  (v.playbackState==="playing"||v.playbackState==="idle"||v.playbackState==="error")&&
  (v.errorCode===null||(typeof v.errorCode==="string"&&/^[A-Z0-9_]{1,80}$/.test(v.errorCode)));
}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 const {token}=await params;
 if(!/^[A-Za-z0-9_-]{32,80}$/.test(token))return reply({ok:false},404);
 let body:unknown;try{body=await readLimitedJson(req,2048);}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 if(!validReport(body))return reply({ok:false,code:"INVALID_PLAYER_HEALTH"},400);
 try{
  const [result]=await database().execute(
   "UPDATE display_screens SET player_health_json=?,player_health_at=UTC_TIMESTAMP(),player_error_code=?,last_seen_at=UTC_TIMESTAMP() WHERE token_hash=? AND enabled=TRUE AND paused=FALSE AND EXISTS (SELECT 1 FROM tenants t WHERE t.id=display_screens.tenant_id AND t.status='active')",
   [JSON.stringify(body),body.errorCode,digest(token)]
  );
  if(Number((result as {affectedRows?:number}).affectedRows??0)!==1)return reply({ok:false},404);
  return reply({ok:true});
 }catch{return reply({ok:false,code:"PLAYER_HEALTH_UNAVAILABLE"},503);}
}
