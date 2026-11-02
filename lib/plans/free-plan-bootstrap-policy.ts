/**
 * Free-plan bootstrap policy. Migration 0093 might be installed before the
 * built-in plans exist. Run once on first initialization; never recreate an
 * override after an administrator restores the shared default.
 */
export const FREE_CATALOG_LIMIT=20;
export function initialPlanFeatureLimit(planCode:string,featureKey:string):number|null{
 return planCode==="free"&&(featureKey==="digital_menu"||featureKey==="catalog")?FREE_CATALOG_LIMIT:null;
}
export function shouldSeedFreeActivityDefaults(existingFreePlan:boolean,sharedGrants:number,activityOverrides:number):boolean{
 if(!Number.isSafeInteger(sharedGrants)||sharedGrants<0||!Number.isSafeInteger(activityOverrides)||activityOverrides<0)
  throw new Error("INVALID_FREE_PLAN_STATE");
 return !existingFreePlan||(sharedGrants===0&&activityOverrides===0);
}
