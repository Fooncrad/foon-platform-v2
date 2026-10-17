import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {isActivityType} from "@/lib/platform/activity-presets";

/** Query the activity ONLY after tenant membership has been checked. */
export async function tenantWorkspaceActivity(tenantId:string):Promise<string|null>{
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT t.kind,bp.activity_code FROM tenants t LEFT JOIN tenant_business_profiles bp ON bp.tenant_id=t.id WHERE t.id=? AND t.status='active' LIMIT 1",[tenantId]);
 if(!rows.length)return null;
 const activity=String(rows[0].activity_code??"");
 if(isActivityType(activity))return activity;
 return rows[0].kind==="restaurant"?"restaurant":null;
}
