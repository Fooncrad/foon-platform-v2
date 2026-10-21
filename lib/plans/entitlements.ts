import type { PoolConnection,RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import {passesServerActivityRestriction} from "@/lib/platform/activity-plan-entitlements";
export type Entitlement={enabled:boolean;limit:number|null;reason:"ACTIVE"|"NOT_GRANTED"|"NO_ACTIVE_SUBSCRIPTION"|"UNSUPPORTED_ACTIVITY"};
/** Fail closed: no active subscription means no paid feature grants. */
export async function tenantEntitlement(tenantId:string,featureKey:string,connection:Pick<PoolConnection,"execute">=database()):Promise<Entitlement>{
 const [rows]=await connection.execute<RowDataPacket[]>(
  "SELECT p.code AS plan_code,COALESCE(af.enabled,pf.enabled) AS enabled,CASE WHEN af.plan_id IS NOT NULL THEN af.limit_value ELSE pf.limit_value END AS limit_value,business.activity_code FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE JOIN package_features f ON f.feature_key=? LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key LEFT JOIN tenant_business_profiles business ON business.tenant_id=s.tenant_id LEFT JOIN package_plan_activity_features af ON af.plan_id=p.id AND af.feature_key=f.feature_key AND af.activity_code=business.activity_code WHERE s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LIMIT 1",
  [featureKey,tenantId]);
 if(!rows.length)return {enabled:false,limit:null,reason:"NO_ACTIVE_SUBSCRIPTION"};
 if(!passesServerActivityRestriction(rows[0].activity_code,featureKey))return {enabled:false,limit:null,reason:"UNSUPPORTED_ACTIVITY"};
 const enabled=Boolean(rows[0].enabled);
 return {enabled,limit:rows[0].limit_value==null?null:Number(rows[0].limit_value),reason:enabled?"ACTIVE":"NOT_GRANTED"};
}

