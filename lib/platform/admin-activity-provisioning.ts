/** Validates an admin-created business before any tenant or subscription writes. */
export type AdminActivityLookups = {
  isActivityType: (activity: string) => boolean;
  currencyForCountry: (countryCode: string) => string | undefined;
  countryRegions: Record<string, string[]>;
};
type AdminBusinessProfile = {
  ok: true; activity: string; kind: "restaurant" | "store";
  countryCode: string; currency: string; region: string; taxNumber: string | null;
};
type AdminBusinessFailure = {ok: false; code: "ACTIVITY_REQUIRED" | "INVALID_LOCALE" | "INVALID_INPUT"};
const dining = new Set(["restaurant", "cafe", "sweets"]);
export function validateAdminBusinessProfile(
  body: Record<string, unknown>, lookups: AdminActivityLookups
): AdminBusinessProfile | AdminBusinessFailure {
  const activity = typeof body.activity === "string" ? body.activity : "";
  if (!lookups.isActivityType(activity)) return {ok:false,code:"ACTIVITY_REQUIRED"};
  const kind = dining.has(activity) ? "restaurant" : "store";
  if (body.kind !== undefined && body.kind !== kind) return {ok:false,code:"INVALID_INPUT"};
  const countryCode = typeof body.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
  const currency = lookups.currencyForCountry(countryCode);
  const region = typeof body.region === "string" ? body.region.trim() : "";
  const taxNumber = typeof body.taxNumber === "string" ? body.taxNumber.trim() : "";
  const regions = lookups.countryRegions[countryCode];
  if (!currency || region.length < 2 || region.length > 120 || taxNumber.length > 64 ||
    (regions && !regions.includes(region))) return {ok:false,code:"INVALID_LOCALE"};
  return {ok:true,activity,kind,countryCode,currency,region,taxNumber:taxNumber || null};
}
