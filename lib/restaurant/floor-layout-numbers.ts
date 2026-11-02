/** Normalize Arabic-Indic and Persian digits to ASCII for form controls and API. */
export function latinDigits(input:string):string{
 return input.replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-0x660)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-0x6f0)).replace(/٫/g,".").replace(/٬/g,"");
}
export function englishNumber(input:string):number{return Number(latinDigits(input))}
