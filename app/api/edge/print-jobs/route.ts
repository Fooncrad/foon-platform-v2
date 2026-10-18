import {database} from "@/lib/db/mysql";
import {claimPrintJob} from "@/lib/platform/edge-print-jobs.mjs";
export const runtime="nodejs";
export async function GET(request:Request){
 try{return await claimPrintJob(request,{pool:database(),enabled:process.env.FOON_EDGE_PRINT_AGENT_ENABLED==="true"});}
 catch{return Response.json({error:"PRINT_AGENT_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
}
