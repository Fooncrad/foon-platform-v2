/** Validation shared by the platform admin's tenant-provisioning route. */
export declare function parseAdminStoreProfile(
  body: unknown,
  dependencies: {
    validActivities: (activity: string) => boolean;
    currencyForCountry: (countryCode: string) => string | undefined;
    countryRegions: Record<string, readonly string[] | undefined>;
  },
): {
  activity: string;
  countryCode: string;
  currency: string;
  region: string;
  taxNumber: string | null;
  kind: "restaurant" | "store";
} | null;
