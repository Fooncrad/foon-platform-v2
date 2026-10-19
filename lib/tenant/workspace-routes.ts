import {isActivityType, type ActivityType} from "@/lib/platform/activity-presets";

/** Canonical URL aliases. Database activity_code and tenant UUIDs stay stable. */
export const ACTIVITY_ROUTE_SLUGS:Record<ActivityType,string>={
 restaurant:"restaurant", cafe:"cafe", sweets:"sweets", grocery:"grocery",
 clothing:"fashion", perfume:"perfume", accessories:"accessories",
 watches:"watches", gifts:"gifts", ecommerce:"ecommerce",
 carwash:"carwash", automotive:"car", laundry:"laundry", salon:"salon",
 publicworks:"contracting"
};
export function activityFromRouteSlug(slug:string):ActivityType|null{
 const match=(Object.entries(ACTIVITY_ROUTE_SLUGS) as [ActivityType,string][]).find(([,route])=>route===slug);
 return match?.[0]??null;
}
export function activityWorkspacePath(activity:string):string{
 if(!isActivityType(activity))throw new Error("UNKNOWN_ACTIVITY");
 return "/"+ACTIVITY_ROUTE_SLUGS[activity];
}
export function activityWorkspaceUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity);
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
export function activitySectionUrl(activity:string,section:string):string{
 const path=activityWorkspacePath(activity);
 return section==="overview"?path:path+"/"+encodeURIComponent(section);
}
export function activityPaymentsUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity)+"/payments";
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
export function activityMediaStudioUrl(activity:string,tenantId?:string):string{
 const path=activityWorkspacePath(activity)+"/media-studio";
 return tenantId?path+"?tenant="+encodeURIComponent(tenantId):path;
}
