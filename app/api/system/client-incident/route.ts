import {NextResponse} from "next/server";
import {assertSameOrigin} from "@/lib/security/origin";
import {logIncident} from "@/lib/platform/incidents";
export const runtime="nodejs";

const entries=new Map<string,{count:number;until:number}>();
function allowed(request:Request){
 // Best-effort per-process throttling; not a distributed rate limiter.
 const ip=(request.headers.get("x-real-ip")??request.headers.get("x-forwarded-for")?.split(",")[0]??"unknown").trim().slice(0,80);
 const now=Date.now(),previous=entries.get(ip);
 if(previous&&previous.until>now&&previous.count>=12)return false;
 if(entries.size>1500)entries.clear();
 entries.set(ip,previous&&previous.until>now?{...previous,count:previous.count+1}:{count:1,until:now+60000});
 return true;
}
export async function POST(request:Request){
 try{assertSameOrigin(request);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 if(Number(request.headers.get("content-length")??0)>512)return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:413});
 if(!allowed(request))return NextResponse.json({ok:false,code:"RATE_LIMITED"},{status:429});
 const body=await request.json().catch(()=>null);
 const incidentId=body?.incidentId,source=body?.source;
 if(typeof incidentId!=="string"||!/^WEB-[A-F0-9]{12}$/.test(incidentId)||!["app-error","global-error"].includes(source))
  return NextResponse.json({ok:false,code:"INVALID_INPUT"},{status:400});
 // Do not receive paths, stack traces, emails, tokens or other user input here.
 logIncident({incidentId,code:"CLIENT_RENDER_ERROR",location:source});
 return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store","X-Foon-Incident-Id":incidentId}});
}
