import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {parseMarketFilters,buildMarketWhere} from "@/lib/market/search";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const url=new URL(req.url);
 const filters=parseMarketFilters({country:url.searchParams.get("country"),q:url.searchParams.get("q")});
 if(!filters.country||filters.q.length<2)return NextResponse.json({ok:true,suggestions:[]},{headers:{"Cache-Control":"no-store"}});
 const {where,args}=buildMarketWhere(filters);
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT DISTINCT t.name FROM tenants t JOIN tenant_business_profiles bp ON bp.tenant_id=t.id WHERE "+where+" ORDER BY t.name LIMIT 8",args);
  return NextResponse.json({ok:true,suggestions:rows.map(r=>String(r.name))},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({ok:false,suggestions:[]},{status:503,headers:{"Cache-Control":"no-store"}});}
}
