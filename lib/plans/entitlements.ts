import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
export type Entitlement={enabled:boolean;limit:number|null;reason:"ACTIVE"|"NOT_GRANTED"|"NO_ACTIVE_SUBSCRIPTION"};
/** Fail closed: no active subscription means no paid feature grants. */
export async function tenantEntitlement(tenantId:string,featureKey:string):Promise<Entitlement>{
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT p.code AS plan_code,pf.enabled,pf.limit_value FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE JOIN package_features f ON f.feature_key=? LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key WHERE s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LIMIT 1",
  [featureKey,tenantId]);
 if(!rows.length)return {enabled:false,limit:null,reason:"NO_ACTIVE_SUBSCRIPTION"};
 const enabled=rows[0].enabled===null?rows[0].plan_code==="enterprise":Boolean(rows[0].enabled);
 return {enabled,limit:rows[0].limit_value==null?null:Number(rows[0].limit_value),reason:enabled?"ACTIVE":"NOT_GRANTED"};
}
