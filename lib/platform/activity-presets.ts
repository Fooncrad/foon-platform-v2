/** Registration-time activity defaults. Keep capabilities separate from plan grants and RBAC. */
export const ACTIVITY_PRESETS = {
  restaurant: ["catalog","orders","pos","tables","reservations","waitlist","kitchen","waiter","inventory"],
  cafe: ["catalog","orders","pos","kitchen","inventory"],
  sweets: ["catalog","orders","pos","inventory"],
  grocery: ["catalog","orders","pos","inventory","barcode","suppliers","delivery","pickup"],
  clothing: ["catalog","orders","pos","inventory","variants","delivery","pickup"],
  perfume: ["catalog","orders","pos","inventory","variants","delivery"],
  accessories: ["catalog","orders","pos","inventory","variants","delivery"],
  gifts: ["catalog","orders","pos","inventory","delivery"],
  ecommerce: ["catalog","orders","inventory","delivery","pickup"],
  carwash: ["services","bookings","orders","pos"],
  laundry: ["services","orders","pos","delivery","pickup"],
  automotive: ["services","bookings","orders","pos","inventory"],
  salon: ["services","bookings","pos","staff"],
  publicworks: ["services","quotes","bookings","invoices"]
} as const;
export type ActivityType = keyof typeof ACTIVITY_PRESETS;
export type ActivityModule = (typeof ACTIVITY_PRESETS)[ActivityType][number];
export function isActivityType(value: string): value is ActivityType {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_PRESETS, value);
}
export function defaultActivityModules(activity: string): readonly string[] {
  if (!isActivityType(activity)) throw new Error("UNSUPPORTED_ACTIVITY_TYPE");
  return ACTIVITY_PRESETS[activity];
}
