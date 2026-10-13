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

export type ActivityLanguage = "ar" | "en" | "fr";
export const MODULE_LABELS: Record<string,Record<ActivityLanguage,string>> = {
  catalog:{ar:"المنتجات والقائمة",en:"Products & menu",fr:"Produits et menu"},
  orders:{ar:"الطلبات",en:"Orders",fr:"Commandes"},
  pos:{ar:"نقاط البيع",en:"Point of sale",fr:"Point de vente"},
  tables:{ar:"الطاولات",en:"Tables",fr:"Tables"},
  reservations:{ar:"الحجوزات",en:"Reservations",fr:"Réservations"},
  waitlist:{ar:"قائمة الانتظار",en:"Waitlist",fr:"Liste d’attente"},
  kitchen:{ar:"المطبخ والتحضير",en:"Kitchen & preparation",fr:"Cuisine et préparation"},
  waiter:{ar:"خدمة النادل",en:"Waiter service",fr:"Service en salle"},
  inventory:{ar:"المخزون",en:"Inventory",fr:"Stocks"},
  barcode:{ar:"الباركود",en:"Barcode",fr:"Code-barres"},
  suppliers:{ar:"الموردون",en:"Suppliers",fr:"Fournisseurs"},
  delivery:{ar:"التوصيل",en:"Delivery",fr:"Livraison"},
  pickup:{ar:"الاستلام",en:"Pickup",fr:"Retrait"},
  variants:{ar:"خيارات المنتجات",en:"Product variants",fr:"Variantes de produits"},
  services:{ar:"الخدمات",en:"Services",fr:"Services"},
  bookings:{ar:"المواعيد والحجوزات",en:"Appointments & bookings",fr:"Rendez-vous et réservations"},
  staff:{ar:"الموظفون",en:"Staff",fr:"Personnel"},
  quotes:{ar:"عروض الأسعار",en:"Quotations",fr:"Devis"},
  invoices:{ar:"الفواتير",en:"Invoices",fr:"Factures"}
};
export function localizedActivityModules(activity:string, language:ActivityLanguage){
 return defaultActivityModules(activity).map(code=>({code,label:MODULE_LABELS[code]?.[language]??code}));
}
