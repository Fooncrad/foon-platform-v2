import {database} from "@/lib/db/mysql";
import {reportPrintJob} from "@/lib/platform/edge-print-jobs.mjs";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{return await reportPrintJob(request,{pool:database(),jobId:(await params).id,enabled:process.env.FOON_EDGE_PRINT_AGENT_ENABLED==="true"});}
 catch{return Response.json({error:"PRINT_RESULT_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
}
