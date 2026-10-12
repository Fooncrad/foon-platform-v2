import {database} from "@/lib/db/mysql";
import {receiveEdgeRequest} from "@/lib/platform/edge-sync-http.mjs";
export const runtime="nodejs";
export async function POST(request:Request){
 if(process.env.FOON_EDGE_PLAIN_TAKEAWAY_ENABLED!=="true")return Response.json({error:"EDGE_NOT_CONFIGURED"},{status:503,headers:{"cache-control":"no-store"}});
 try{return await receiveEdgeRequest(request,{pool:database(),masterKey:process.env.FOON_EDGE_MASTER_RECEIPT_KEY,plainTakeawayEnabled:true});}
 catch{return Response.json({error:"EDGE_SYNC_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
}
