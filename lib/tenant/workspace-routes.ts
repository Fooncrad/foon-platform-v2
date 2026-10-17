import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {isActivityType} from "@/lib/platform/activity-presets";

/** The activity identifier is part of the private workspace route, never the
 * tenant ID, customer slug, membership role or database legacy bucket kind. */
export function activityWorkspacePath(activity:string):string{
 if(!isActivityType(activity))throw new Error("UNKNOWN_ACTIVITY");
 return "/workspace/"+activity;
}
export function activityWorkspaceUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity);
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
/** Only use after tenant membership has already been checked. */
export async function tenantWorkspaceActivity(tenantId:string):Promise<string|null>{
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT t.kind,bp.activity_code FROM tenants t LEFT JOIN tenant_business_profiles bp ON bp.tenant_id=t.id WHERE t.id=? AND t.status='active' LIMIT 1",
  [tenantId]);
 if(!rows.length)return null;
 const code=String(rows[0].activity_code??"");
 if(isActivityType(code))return code;
 // Backward compatible only for historical restaurant records lacking a
 // profile; a store with a missing profile must not impersonate a restaurant.
 return rows[0].kind==="restaurant"?"restaurant":null;
}
