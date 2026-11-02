import type { PoolConnection,RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";
import {passesServerActivityRestriction} from "@/lib/platform/activity-plan-entitlements";
export type Entitlement={enabled:boolean;limit:number|null;reason:"ACTIVE"|"NOT_GRANTED"|"NO_ACTIVE_SUBSCRIPTION"|"UNSUPPORTED_ACTIVITY"};
/** Fail closed: no active subscription means no paid feature grants. */
export async function tenantEntitlement(tenantId:string,featureKey:string,connection:Pick<PoolConnection,"execute">=database()):Promise<Entitlement>{
 const [rows]=await connection.execute<RowDataPacket[]>(
  "SELECT p.code AS plan_code,COALESCE(af.enabled,pf.enabled) AS enabled,CASE WHEN af.plan_id IS NOT NULL THEN af.limit_value ELSE pf.limit_value END AS limit_value,business.activity_code FROM tenant_subscriptions s JOIN package_plans p ON BINARY p.id=BINARY s.plan_id AND p.enabled=TRUE JOIN package_features f ON BINARY f.feature_key=BINARY ? LEFT JOIN package_plan_features pf ON BINARY pf.plan_id=BINARY p.id AND BINARY pf.feature_key=BINARY f.feature_key LEFT JOIN tenant_business_profiles business ON BINARY business.tenant_id=BINARY s.tenant_id LEFT JOIN package_plan_activity_features af ON BINARY af.plan_id=BINARY p.id AND BINARY af.feature_key=BINARY f.feature_key AND BINARY af.activity_code=BINARY business.activity_code WHERE BINARY s.tenant_id=BINARY ? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LIMIT 1",
  [featureKey,tenantId]);
 if(!rows.length)return {enabled:false,limit:null,reason:"NO_ACTIVE_SUBSCRIPTION"};
 if(!passesServerActivityRestriction(rows[0].activity_code,featureKey))return {enabled:false,limit:null,reason:"UNSUPPORTED_ACTIVITY"};
 const enabled=Number(rows[0].enabled)===1;
 return {enabled,limit:rows[0].limit_value==null?null:Number(rows[0].limit_value),reason:enabled?"ACTIVE":"NOT_GRANTED"};
}

