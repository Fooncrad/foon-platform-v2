import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentUserId} from "@/lib/auth/session";
import {employeePersonalAccessDenied} from "@/lib/auth/account-surface";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const denied=await employeePersonalAccessDenied();if(denied)return denied;
 const id=await currentUserId();
 if(!id)return NextResponse.json({ok:false,code:"LOGIN_REQUIRED"},{status:401,headers:{"Cache-Control":"no-store"}});
 const tenantId=new URL(request.url).searchParams.get("tenantId");
 if(typeof tenantId!=="string"||!/^[a-f0-9-]{36}$/i.test(tenantId))return NextResponse.json({ok:false,code:"INVALID_TENANT"},{status:400,headers:{"Cache-Control":"no-store"}});
 // A visible campaign is not a guaranteed discount. Checkout eligibility is validated separately.
 const [rows]=await database().execute<RowDataPacket[]>(`SELECT c.id,c.kind,c.title_ar,c.title_en,c.title_fr,c.discount_type,c.discount_value,c.currency,c.minimum_spend,c.maximum_discount,c.starts_at,c.ends_at
 FROM growth_campaigns c JOIN tenants t ON t.id=c.tenant_id AND t.status='active'
 JOIN tenant_customers tc ON tc.tenant_id=c.tenant_id AND tc.user_id=?
 WHERE c.tenant_id=? AND c.branch_id IS NULL AND c.status='active'
 AND c.starts_at<=UTC_TIMESTAMP() AND c.ends_at>UTC_TIMESTAMP()
 AND (c.usage_limit IS NULL OR (SELECT COUNT(*) FROM growth_campaign_redemptions r WHERE r.campaign_id=c.id AND r.status IN ('reserved','confirmed'))<c.usage_limit)
 ORDER BY c.ends_at ASC LIMIT 20`,[id,tenantId]);
 return NextResponse.json({ok:true,campaigns:rows},{headers:{"Cache-Control":"no-store"}});
}
