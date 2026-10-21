import { NextResponse } from "next/server";
import { databaseHealth } from "@/lib/db/mysql";
import {incidentId,logIncident,normalizeLocale} from "@/lib/platform/incidents";
import {localizedSystemStatus} from "@/lib/platform/system-status-copy";

export const runtime="nodejs";
export async function GET(request:Request){
 try{
  const db=await databaseHealth();
  return NextResponse.json({ok:true,service:"foon-platform-v2",runtime:process.version,db});
 }catch(error){
  const reference=incidentId();
  logIncident({incidentId:reference,code:"DATABASE_UNAVAILABLE",location:"api.health",error});
  const locale=normalizeLocale(request.headers.get("accept-language"));
  return NextResponse.json({ok:false,service:"foon-platform-v2",code:"DATABASE_UNAVAILABLE",incidentId:reference,message:localizedSystemStatus(locale,"SERVICE_UNAVAILABLE").description},{status:503,headers:{"Cache-Control":"no-store","Content-Language":locale,"X-Foon-Incident-Id":reference}});
 }
}
