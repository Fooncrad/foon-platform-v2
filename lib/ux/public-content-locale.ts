export type PublicContentLanguage="ar"|"en"|"fr";
export function isPublicContentLanguage(value:unknown):value is PublicContentLanguage{
 return value==="ar"||value==="en"||value==="fr";
}
/** An explicit CMS permalink locale wins; otherwise follow the user's saved UI language. */
export function resolvePublicContentLanguage(urlLang:unknown,cookieLang:unknown):PublicContentLanguage{
 if(isPublicContentLanguage(urlLang))return urlLang;
 return isPublicContentLanguage(cookieLang)?cookieLang:"ar";
}
/** Never turn a missing localized title/body into the literal text 'null' or 'undefined'. */
export function publicContentText(row:Record<string,unknown>,field:"title"|"body",language:PublicContentLanguage):string{
 const requested=row[`${field}_${language}`],arabic=row[`${field}_ar`];
 if(typeof requested==="string"&&requested.trim().length)return requested;
 return typeof arabic==="string"?arabic:"";
}
