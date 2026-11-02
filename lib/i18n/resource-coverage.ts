/**
 * Reports missing merchant-authored translations without guessing or inventing copy.
 * Data stays tenant-scoped: callers pass only rows they are already authorized to read.
 */
export type LocalizedMerchantResource={name:string;data:Record<string,unknown>};
export type LocalizedField={key:string};
const pairs=[
 ["name","nameEn","nameFr"],
 ["brandName","brandNameEn","brandNameFr"],
 ["hotelName","hotelNameEn","hotelNameFr"],
 ["address","addressEn","addressFr"],
 ["description","descriptionEn","descriptionFr"],
 ["instructions","instructionsEn","instructionsFr"],
] as const;

export function missingResourceTranslations(row:LocalizedMerchantResource,fields:readonly LocalizedField[]):string[]{
 const fieldsInModule=new Set(fields.map(field=>field.key));
 const missing:string[]=[];
 for(const [arabic,english,french] of pairs){
  if(!fieldsInModule.has(english)||!fieldsInModule.has(french))continue;
  const base=arabic==="name"?row.name:row.data[arabic];
  if(typeof base!=="string"||!base.trim())continue;
  for(const translatedKey of [english,french]){
   const value=row.data[translatedKey];
   if(typeof value!=="string"||!value.trim())missing.push(translatedKey);
  }
 }
 return missing;
}
