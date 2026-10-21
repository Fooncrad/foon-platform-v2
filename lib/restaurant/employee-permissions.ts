const modules=["orders","pos","kitchen","menu","categories","tables","sections","reservations","waitlist","waiterCalls","team","attendance","inventory","coupons","marketing","customerInvoices","internalInvoices","printers","reports","storefront","notifications","loyalty","delivery","security"] as const;
const actions=["view","create","edit","accept","reject","cancel","delete","manage"] as const;
export const validPermissions=new Set<string>(modules.flatMap(module=>actions.map(action=>module+"."+action)));

/** Reject duplicate or malformed grants before opening a staff transaction. */
export function normalizeEmployeePermissions(value:unknown):string[]|null{
 if(!Array.isArray(value)||value.length>validPermissions.size)return null;
 if(value.some((p:unknown)=>typeof p!=="string"||!validPermissions.has(p)))return null;
 if(new Set(value).size!==value.length)return null;
 return value;
}
