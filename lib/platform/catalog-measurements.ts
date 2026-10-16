export const sellingUnits=["piece","pack","kg","g","l","ml","m","cm","m2","m3","hour","service"] as const;
export type CatalogMeasurements={unit:typeof sellingUnits[number];weightKg:number|null;lengthCm:number|null;widthCm:number|null;heightCm:number|null};
export function parseCatalogMeasurements(value:unknown):CatalogMeasurements{
 if(!value||typeof value!=="object"||Array.isArray(value))throw Error("INVALID_MEASUREMENTS");
 const v=value as Record<string,unknown>;
 if(!sellingUnits.includes(v.unit as CatalogMeasurements["unit"]))throw Error("INVALID_UNIT");
 const result={unit:v.unit} as CatalogMeasurements;
 for(const key of ["weightKg","lengthCm","widthCm","heightCm"] as const){const n=v[key];if(n!==null&&(typeof n!=="number"||!Number.isFinite(n)||n<0||n>999999))throw Error("INVALID_MEASUREMENTS");result[key]=n as number|null}
 return result;
}
