import {isActivityType} from "@/lib/platform/activity-presets";

/** Activity-specific workspace route using its registered activity_code. */
export function activityWorkspacePath(activity:string):string{
 if(!isActivityType(activity))throw new Error("UNKNOWN_ACTIVITY");
 return "/workspace/"+activity;
}
export function activityWorkspaceUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity);
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}

export function activityPaymentsUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity)+"/payments";
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
