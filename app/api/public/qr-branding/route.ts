import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {defaultQrBranding,parseQrBranding} from "@/lib/platform/qr-branding";
export const dynamic="force-dynamic";
export async function GET(req:Request){
 const slug=new URL(req.url).searchParams.get("slug")||"";
 if(!/^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$/.test(slug))return NextResponse.json({ok:false},{status:400});
 try{
  const [rows]=await database().execute<RowDataPacket[]>(`SELECT q.settings FROM tenant_qr_branding q JOIN tenants t ON t.id=q.tenant_id WHERE t.slug=? AND t.status='active' LIMIT 1`,[slug]);
  const raw=rows[0]?.settings;return NextResponse.json({ok:true,settings:parseQrBranding(typeof raw==="string"?JSON.parse(raw):raw)??defaultQrBranding},{headers:{"Cache-Control":"public, max-age=30"}});
 }catch{return NextResponse.json({ok:true,settings:defaultQrBranding},{headers:{"Cache-Control":"no-store"}})}
}
