export type QrBranding={ink:string;paper:string;size:200|240|300;frame:"plain"|"rounded"|"gold";captionAr:string;captionEn:string;captionFr:string;showLogo:boolean};
export const defaultQrBranding:QrBranding={ink:"#171613",paper:"#ffffff",size:240,frame:"rounded",captionAr:"امسح الرمز",captionEn:"Scan QR",captionFr:"Scannez le QR",showLogo:true};
export function parseQrBranding(value:unknown):QrBranding|null{
 if(!value||typeof value!=="object")return null;
 const v=value as Record<string,unknown>;
 if(typeof v.ink!=="string"||!/^#[0-9a-f]{6}$/i.test(v.ink)||typeof v.paper!=="string"||!/^#[0-9a-f]{6}$/i.test(v.paper)||!([200,240,300].includes(Number(v.size)))||!["plain","rounded","gold"].includes(String(v.frame))||typeof v.showLogo!=="boolean")return null;
 for(const k of ["captionAr","captionEn","captionFr"]){if(typeof v[k]!=="string"||v[k].length>80)return null}
 return {ink:v.ink,paper:v.paper,size:v.size as QrBranding["size"],frame:v.frame as QrBranding["frame"],showLogo:v.showLogo,captionAr:v.captionAr as string,captionEn:v.captionEn as string,captionFr:v.captionFr as string};
}
