import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
export const runtime="nodejs";
export async function GET(){
 const configured=Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.APP_URL);
 let enabled=false;
 if(configured){
  try{
   const [rows]=await database().execute<RowDataPacket[]>("SELECT config_value FROM platform_configuration WHERE config_key='google_oauth_enabled' LIMIT 1");
   enabled=rows[0]?.config_value!=="false";
  }catch{enabled=false;}
 }
 return NextResponse.json({available:configured&&enabled},{headers:{"cache-control":"private, no-store"}});
}
