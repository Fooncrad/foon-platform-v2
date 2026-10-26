export const sellingUnits=["piece","pack","kg","g","l","ml","m","cm","m2","m3","hour","service"] as const;
export type CatalogMeasurements={unit:typeof sellingUnits[number];weightKg:number|null;lengthCm:number|null;widthCm:number|null;heightCm:number|null;quantityMode?:"whole"|"measured"};
export function parseCatalogMeasurements(value:unknown):CatalogMeasurements{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_MEASUREMENTS");
 const v=value as Record<string,unknown>;
 if(!sellingUnits.includes(v.unit as CatalogMeasurements["unit"]))throw Error("INVALID_UNIT");
 const result={unit:v.unit} as CatalogMeasurements;
 for(const key of ["weightKg","lengthCm","widthCm","heightCm"] as const){const n=v[key];if(n!==null&&(typeof n!=="number"||!Number.isFinite(n)||n<0||n>999999))throw Error("INVALID_MEASUREMENTS");result[key]=n as number|null}
 if(v.quantityMode!==undefined){if(typeof v.quantityMode!=="string"||!["whole","measured"].includes(v.quantityMode)||v.quantityMode==="measured"&&!["kg","g","l","ml","m","cm","m2","m3"].includes(String(v.unit)))throw Error("INVALID_QUANTITY_MODE");result.quantityMode=v.quantityMode as "whole"|"measured"}
 return result;
}

/** Quantities are represented by thousandths; tolerate only floating-point representation noise. */
export function validCatalogQuantity(value:unknown,max=1000):value is number{
 return typeof value==="number"&&Number.isFinite(value)&&value>=0.001&&value<=max&&Math.abs(value*1000-Math.round(value*1000))<0.0000001;
}
export function catalogQuantityPolicy(attributes:unknown){
 let a:Record<string,unknown>={};try{a=(typeof attributes==="string"?JSON.parse(attributes):attributes)??{}}catch{}
 const m=a.measurements as Record<string,unknown>|undefined;
 const unit=typeof m?.unit==="string"?m.unit:"piece";
 return {unit,measured:m?.quantityMode==="measured"&&["kg","g","l","ml","m","cm","m2","m3"].includes(unit)};
}

export type CombinationAvailability={options:string[];stock:number|null};
export function combinationAvailable(variants:CombinationAvailability[]|undefined,ids:string[]){
 return !variants?.length||(new Set(ids).size===ids.length&&variants.some(v=>v.options.length===ids.length&&new Set(v.options).size===v.options.length&&v.options.every(id=>ids.includes(id))&&(v.stock===null||v.stock>0)));
}
