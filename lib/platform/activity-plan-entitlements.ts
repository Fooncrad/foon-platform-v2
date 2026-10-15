import {ACTIVITY_PRESETS, isActivityType} from "./activity-presets.ts";

/**
 * Capability = activity support; grant = subscription entitlement;
 * permission = current employee authorization. Never conflate them.
 */
export type PlanGrant = {feature_key:string; enabled:boolean; limit_value:number|null};
export type ActivityEntitlement = {key:string; available:boolean; limit:number|null; reason:"available"|"unsupported_activity"|"not_granted"|"permission_denied"};

const FEATURE_CAPABILITIES:Readonly<Record<string,string>>={waiter_call:"waiter",kds:"kitchen",service_catalog:"services",appointments:"bookings",takeaway:"pickup",digital_menu:"catalog",qr_menu:"catalog"};
const knownCapabilities=new Set<string>(Object.values(ACTIVITY_PRESETS).flatMap(modules=>[...modules]));
/** Classification does not grant access; exact subscription keys remain independent. */
export function activityFeatureCapability(key:string):string{return Object.hasOwn(FEATURE_CAPABILITIES,key)?FEATURE_CAPABILITIES[key]:key;}
export function activityFeatureSupport(activity:string,key:string):"supported"|"unsupported"|"unclassified"{
 if(!isActivityType(activity))throw new Error("UNSUPPORTED_ACTIVITY_TYPE");
 const capability=activityFeatureCapability(key);
 if(key.startsWith("branding."))return "supported";
 if(!knownCapabilities.has(capability))return "unclassified";
 return (ACTIVITY_PRESETS[activity] as readonly string[]).includes(capability)?"supported":"unsupported";
}

export function resolveActivityEntitlements(
 activity:string,
 grants:readonly PlanGrant[],
 permissions:readonly string[]|null=null,
):ActivityEntitlement[]{
 if(!isActivityType(activity)) throw new Error("UNSUPPORTED_ACTIVITY_TYPE");
 const supported=new Set<string>(ACTIVITY_PRESETS[activity]);
 const byKey=new Map<string,PlanGrant>();
 for(const grant of grants){
  if(!grant.feature_key||typeof grant.enabled!=="boolean"||grant.limit_value!==null&&(!Number.isSafeInteger(grant.limit_value)||grant.limit_value<0))throw new Error("INVALID_PLAN_GRANT");
  if(byKey.has(grant.feature_key))throw new Error("DUPLICATE_PLAN_GRANT");
  byKey.set(grant.feature_key,grant);
 }
 const keys=new Set([...supported,...byKey.keys()]);
 const allowed=permissions===null?null:new Set(permissions);
 return [...keys].map(key=>{
  const grant=byKey.get(key);
  const reason:ActivityEntitlement["reason"]=activityFeatureSupport(activity,key)!=="supported"?"unsupported_activity":
   !grant?.enabled?"not_granted":
   allowed!==null&&!allowed.has(key)?"permission_denied":"available";
  return {key,available:reason==="available",limit:grant?.limit_value??null,reason};
 });
}

export function canUseActivityFeature(activity:string,feature:string,grants:readonly PlanGrant[],permissions:readonly string[]|null=null):boolean{
 return resolveActivityEntitlements(activity,grants,permissions).some(x=>x.key===feature&&x.available);
}

