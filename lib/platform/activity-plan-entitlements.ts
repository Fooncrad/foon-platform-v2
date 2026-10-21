import {ACTIVITY_PRESETS, isActivityType} from "./activity-presets.ts";

/**
 * Capability = activity support; grant = subscription entitlement;
 * permission = current employee authorization. Never conflate them.
 */
export type PlanGrant = {feature_key:string; enabled:boolean; limit_value:number|null};
export type ActivityEntitlement = {key:string; available:boolean; limit:number|null; reason:"available"|"unsupported_activity"|"not_granted"|"permission_denied"};

const FEATURE_CAPABILITIES:Readonly<Record<string,string>>={
 waiter_call:"waiter",kds:"kitchen",service_catalog:"services",appointments:"bookings",queue:"services",
 takeaway:"pickup",digital_menu:"catalog",nfc_menu:"catalog",
 table_qr:"tables",table_minimum_charge:"tables",split_bills:"tables",split_bill_requests:"tables",
 reservation_fees:"reservations",waitlist_fees:"waitlist",
 departments:"kitchen",department_printers:"kitchen",department_routing:"kitchen",
 purchases:"inventory",suppliers:"inventory"
};
/** Core platform features apply across activities, even when their operational module is not in a preset. */
const COMMON_FEATURES=new Set([
 "catalog","storefront","qr_menu","menu_templates","customer_invoices","internal_invoices",
 "invoice_printing","credit_notes","payments","vat_management","customers","employees",
 "multi_branch","analytics","coupons","loyalty","reviews","campaigns","content_library",
 "storage","sales","departments","department_printers","department_routing"
]);
/** Creator account privileges are not merchant subscription features. */
const CREATOR_ONLY=new Set(["creator_profile","content_marketplace","content_pricing","media_library","watermark"]);
/** Merchant plans never manage creator-account privileges. */
export function isCreatorOnlyFeature(key:string):boolean{return CREATOR_ONLY.has(key);}
const knownCapabilities=new Set<string>(Object.values(ACTIVITY_PRESETS).flatMap(modules=>[...modules]));
const exciseActivities=new Set(["restaurant","cafe","sweets","grocery","perfume"]);
/** Classification does not grant access; exact subscription keys remain independent. */
export function activityFeatureCapability(key:string):string{return Object.hasOwn(FEATURE_CAPABILITIES,key)?FEATURE_CAPABILITIES[key]:key;}
export function activityFeatureSupport(activity:string,key:string):"supported"|"unsupported"|"unclassified"{
 if(!isActivityType(activity))throw new Error("UNSUPPORTED_ACTIVITY_TYPE");
 if(key.startsWith("branding.")||COMMON_FEATURES.has(key))return "supported";
 if(CREATOR_ONLY.has(key))return "unsupported";
 if(key==="room_service")return ["restaurant","cafe"].includes(activity)?"supported":"unsupported";
 if(key==="excise_tax")return exciseActivities.has(activity)?"supported":"unsupported";
 // Restaurant/cafe modifiers and grocery weight/size options reuse the
 // variants feature even though these activities do not list retail variants
 // as a standalone workspace module. The exact paid grant is still required.
 if(key==="variants"&&["restaurant","cafe","grocery"].includes(activity))return "supported";
 // Existing service order operations are gated by the quotes subscription key.
 // Keep it activity-relevant without granting access when the plan denies it.
 if(key==="quotes")return (ACTIVITY_PRESETS[activity] as readonly string[]).includes("services")?"supported":"unsupported";
 if(key==="service_fees")return activity==="restaurant"||activity==="cafe"||
  (ACTIVITY_PRESETS[activity] as readonly string[]).includes("services")?"supported":"unsupported";
 const capability=activityFeatureCapability(key);
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



/** Server enforcement complements the admin activity filter. A supported capability
 * never bypasses a plan grant or employee permissions. Preserve unknown legacy profiles.
 */
const SERVER_RESTRICTED_FEATURES=new Set([
 "tables","reservations","waitlist","kds","waiter_call","digital_menu","nfc_menu",
 "service_catalog","appointments","queue","room_service","split_bills","split_bill_requests",
 "table_qr","table_minimum_charge","reservation_fees","waitlist_fees","service_fees",
 "takeaway","variants","excise_tax",
 "creator_profile","content_marketplace","media_library","watermark","content_pricing"
]);
export function passesServerActivityRestriction(activity:unknown,featureKey:string):boolean{
 // Creator entitlements are account-scoped, never inherited from a merchant
 // plan, even when a legacy tenant has no recognized activity profile.
 if(CREATOR_ONLY.has(featureKey))return false;
 if(!SERVER_RESTRICTED_FEATURES.has(featureKey)||typeof activity!=="string"||!isActivityType(activity))return true;
 return activityFeatureSupport(activity,featureKey)==="supported";
}
