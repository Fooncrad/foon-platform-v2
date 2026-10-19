export type TranslationLeakLanguage="en"|"fr";

export function containsArabic(value:string):boolean{return /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u.test(value);}

export function normalizeTranslationSource(value:string):string{return value.replace(/\s+/gu," ").trim();}

export function translationLeakKey(source:string):string{
 let hash=0xcbf29ce484222325n;
 for(const character of normalizeTranslationSource(source)){
  const codePoint=character.codePointAt(0)??0;
  hash^=BigInt(codePoint);hash=BigInt.asUintN(64,hash*0x100000001b3n);
 }
 return "ui.leak."+hash.toString(16).padStart(16,"0");
}
