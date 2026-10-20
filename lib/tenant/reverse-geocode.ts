// Normalize vendor geocoding responses before using them in a customer's checkout.
type GeocodingPart={long_name?:string;short_name?:string;types?:string[]};
function part(parts:GeocodingPart[],type:string,short=false){
 const entry=parts.find(item=>Array.isArray(item.types)&&item.types.includes(type));
 return (short?entry?.short_name:entry?.long_name)?.trim()??"";
}
export function normalizedReverseGeocode(value:unknown):{countryCode:string;city:string;address:string}|null{
 if(!value||typeof value!=="object")return null;
 const data=value as {status?:unknown;results?:unknown};
 if(data.status!=="OK"||!Array.isArray(data.results))return null;
 for(const item of data.results){
  if(!item||typeof item!=="object")continue;
  const r=item as {formatted_address?:unknown;address_components?:unknown};
  if(!Array.isArray(r.address_components)||typeof r.formatted_address!=="string")continue;
  const parts=r.address_components.filter(x=>x&&typeof x==="object") as GeocodingPart[];
  const countryCode=part(parts,"country",true).toUpperCase();
  const city=part(parts,"locality")||part(parts,"postal_town")||part(parts,"administrative_area_level_2")||part(parts,"administrative_area_level_1");
  const address=r.formatted_address.trim();
  if(/^[A-Z]{2}$/.test(countryCode)&&city.length>=2&&city.length<=120&&address.length>=5&&address.length<=900)return {countryCode,city,address};
 }
 return null;
}
