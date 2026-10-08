import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";
export async function GET(){
 const user=await currentActiveAdminUserId();if(!user)return NextResponse.json({ok:false,code:"UNAUTHENTICATED"},{status:401});
 try{await requirePlatformRole(user,["super_admin","admin","support"]);}catch{return NextResponse.json({ok:false,code:"FORBIDDEN"},{status:403});}
 try{const [rows]=await database().execute<RowDataPacket[]>("SELECT r.receipt_number,r.payment_request_id,r.amount,r.currency,r.issued_at,t.name AS tenant_name FROM platform_payment_receipts r INNER JOIN tenants t ON t.id=r.tenant_id ORDER BY r.issued_at DESC LIMIT 200");return NextResponse.json({ok:true,receipts:rows});}
 catch{return NextResponse.json({ok:false,code:"RECEIPTS_UNAVAILABLE"},{status:503});}
}
