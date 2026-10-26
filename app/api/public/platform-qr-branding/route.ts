import {NextResponse} from "next/server";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";
import {defaultQrBranding,parseQrBranding} from "@/lib/platform/qr-branding";
export async function GET(){try{const [rows]=await database().execute<RowDataPacket[]>("SELECT settings FROM platform_qr_branding WHERE id=1 LIMIT 1");const raw=rows[0]?.settings;return NextResponse.json({ok:true,settings:parseQrBranding(typeof raw==="string"?JSON.parse(raw):raw)??defaultQrBranding},{headers:{"Cache-Control":"public, max-age=30"}})}catch{return NextResponse.json({ok:true,settings:defaultQrBranding},{headers:{"Cache-Control":"no-store"}})}}
