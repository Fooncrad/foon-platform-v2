import {database} from "@/lib/db/mysql";
import {readEdgeCatalog} from "@/lib/platform/edge-catalog-http.mjs";
export const runtime="nodejs";
export async function GET(request:Request){
 if(process.env.FOON_EDGE_PLAIN_TAKEAWAY_ENABLED!=="true")return Response.json({error:"EDGE_NOT_CONFIGURED"},{status:503,headers:{"cache-control":"no-store"}});
 try{return await readEdgeCatalog(request,{pool:database(),enabled:true});}
 catch{return Response.json({error:"EDGE_CATALOG_UNAVAILABLE"},{status:503,headers:{"cache-control":"no-store"}});}
}
