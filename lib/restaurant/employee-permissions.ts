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

/** A password-only PATCH must never clear existing employee grants. */
export function parseEmployeeProvisionPatch(value:unknown):{permissions?:string[];password?:string}|null{
 if(!value||typeof value!=="object"||Array.isArray(value))return null;
 const data=value as Record<string,unknown>;
 const hasPermissions=Object.prototype.hasOwnProperty.call(data,"permissions");
 const hasPassword=Object.prototype.hasOwnProperty.call(data,"password");
 if(!hasPermissions&&!hasPassword)return null;
 const permissions=hasPermissions?normalizeEmployeePermissions(data.permissions):undefined;
 if(hasPermissions&&permissions===null)return null;
 if(hasPassword&&(typeof data.password!=="string"||data.password.length<9||data.password.length>128))return null;
 return {
  ...(hasPermissions?{permissions:permissions as string[]}:{}),
  ...(hasPassword?{password:data.password as string}:{})
 };
}
