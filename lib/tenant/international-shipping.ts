import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {supportedCountries} from "@/lib/tenant/country-catalog";
export const INTERNATIONAL_SHIPPING_EXCLUDED=new Set(["restaurant","cafe"]);
const supportedCountryCodes=new Set<string>(supportedCountries.map(c=>c.code));
export function internationalEligible(activity:string){return Boolean(activity)&&!INTERNATIONAL_SHIPPING_EXCLUDED.has(activity);}
export type InternationalShipping={status:"none"|"pending"|"approved"|"rejected"|"disabled";requestedCountries:string[];approvedCountries:string[]};
function parseCountries(value:unknown):string[]{try{const a=typeof value==="string"?JSON.parse(value):value;return Array.isArray(a)?a.filter(x=>typeof x==="string"&&/^[A-Z]{2}$/.test(x)&&supportedCountryCodes.has(x)).slice(0,80):[]}catch{return []}}
export async function internationalShipping(tenantId:string,db:Pick<ReturnType<typeof database>,"execute">=database()):Promise<InternationalShipping>{
 const [rows]=await db.execute<RowDataPacket[]>("SELECT status,requested_countries,approved_countries FROM tenant_international_shipping WHERE tenant_id=? LIMIT 1",[tenantId]);
 const row=rows[0];return {status:row?.status??"none",requestedCountries:parseCountries(row?.requested_countries),approvedCountries:row?.status==="approved"?parseCountries(row.approved_countries):[]};
}
export async function allowedDeliveryCountries(tenantId:string,merchantCountry:string,activity:string,db:Pick<ReturnType<typeof database>,"execute">=database()){
 const local=merchantCountry.toUpperCase();if(!internationalEligible(activity))return [local];
 const status=await internationalShipping(tenantId,db);
 return Array.from(new Set([local,...status.approvedCountries]));
}
