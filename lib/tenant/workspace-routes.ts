import {isActivityType} from "@/lib/platform/activity-presets";

/** Public route alias only; activity_code and tenant primary keys never change. */
export const ACTIVITY_ROUTE_SLUGS = {
 restaurant:"restaurant", cafe:"cafe", sweets:"sweets", grocery:"grocery",
 clothing:"fashion", perfume:"perfume", accessories:"accessories",
 watches:"watches", gifts:"gifts", ecommerce:"ecommerce",
 carwash:"carwash", automotive:"car", laundry:"laundry", salon:"salon",
 publicworks:"contracting"
} as const;

export function activityWorkspacePath(activity:string):string{
 if(!isActivityType(activity))throw new Error("UNKNOWN_ACTIVITY");
 return "/"+ACTIVITY_ROUTE_SLUGS[activity];
}
export function activityWorkspaceUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity);
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
export function activityPaymentsUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity)+"/payments";
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
export function activityMediaStudioUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity)+"/media-studio";
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
