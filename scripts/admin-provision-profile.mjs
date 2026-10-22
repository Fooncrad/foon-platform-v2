// Shared validation for administrator-created activity profiles. Pure: no DB writes.
const diningActivities=new Set(["restaurant","cafe","sweets"]);
export function parseAdminStoreProfile(body,{validActivities,currencyForCountry,countryRegions}){
 if(!body||typeof body!=="object"||Array.isArray(body))return null;
 const activity=typeof body.activity==="string"?body.activity:"";
 if(!validActivities(activity))return null;
 const countryCode=typeof body.countryCode==="string"?body.countryCode:"";
 const currency=currencyForCountry(countryCode);
 if(!currency||body.currency!==currency)return null;
 const region=typeof body.region==="string"?body.region.trim():"";
 if(region.length<2||region.length>120)return null;
 const regions=countryRegions[countryCode];
 if(regions&&!regions.includes(region))return null;
 const taxNumber=typeof body.taxNumber==="string"?body.taxNumber.trim():"";
 if(taxNumber.length>64)return null;
 return {activity,countryCode,currency,region,taxNumber:taxNumber||null,kind:diningActivities.has(activity)?"restaurant":"store"};
}
