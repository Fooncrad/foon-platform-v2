import {randomBytes} from "node:crypto";

export type PublicErrorCode=
 |"INVALID_INPUT"|"UNAUTHORIZED"|"FORBIDDEN"|"NOT_FOUND"|"CONFLICT"
 |"RATE_LIMITED"|"SERVICE_UNAVAILABLE"|"DATABASE_ERROR"|"INTERNAL_ERROR";

export type PublicLocale="ar"|"en"|"fr";

const messages:Record<PublicLocale,Record<PublicErrorCode,string>>={
 ar:{
 INVALID_INPUT:"البيانات المدخلة غير صحيحة أو ناقصة.",
 UNAUTHORIZED:"يرجى تسجيل الدخول لإكمال العملية.",
 FORBIDDEN:"ليس لديك صلاحية لتنفيذ هذه العملية.",
 NOT_FOUND:"العنصر المطلوب غير موجود.",
 CONFLICT:"تعذر التنفيذ بسبب تعارض في البيانات.",
 RATE_LIMITED:"تمت محاولات كثيرة. حاول مرة أخرى بعد قليل.",
 SERVICE_UNAVAILABLE:"الخدمة غير متاحة مؤقتًا. حاول مرة أخرى.",
 DATABASE_ERROR:"تعذر الوصول إلى البيانات مؤقتًا.",
 INTERNAL_ERROR:"حدث خطأ غير متوقع. حاول مرة أخرى."
 },
 en:{INVALID_INPUT:"The information entered is invalid or incomplete.",UNAUTHORIZED:"Please sign in to continue.",FORBIDDEN:"You do not have permission to perform this action.",NOT_FOUND:"The requested item was not found.",CONFLICT:"The action could not be completed because of a data conflict.",RATE_LIMITED:"Too many attempts. Please try again shortly.",SERVICE_UNAVAILABLE:"The service is temporarily unavailable. Please try again.",DATABASE_ERROR:"The data service is temporarily unavailable.",INTERNAL_ERROR:"An unexpected error occurred. Please try again."},
 fr:{INVALID_INPUT:"Les informations saisies sont invalides ou incomplètes.",UNAUTHORIZED:"Veuillez vous connecter pour continuer.",FORBIDDEN:"Vous n’avez pas l’autorisation d’effectuer cette action.",NOT_FOUND:"L’élément demandé est introuvable.",CONFLICT:"L’action n’a pas pu être effectuée en raison d’un conflit de données.",RATE_LIMITED:"Trop de tentatives. Veuillez réessayer dans quelques instants.",SERVICE_UNAVAILABLE:"Le service est temporairement indisponible. Veuillez réessayer.",DATABASE_ERROR:"Le service de données est temporairement indisponible.",INTERNAL_ERROR:"Une erreur inattendue s’est produite. Veuillez réessayer."}
};

export function incidentId(){
 return randomBytes(4).toString("hex").toUpperCase();
}

export function normalizeLocale(value?:string|null):PublicLocale{
 const locale=(value??"ar").toLowerCase().split("-")[0];
 return locale==="en"||locale==="fr"?locale:"ar";
}

export function publicError(code:PublicErrorCode,status:number,incident=incidentId(),locale:PublicLocale="ar"){
 return {ok:false,error:{code,message:messages[locale][code],incidentId:incident,status}};
}

export function logIncident(input:{incidentId:string;code:string;location:string;error?:unknown;userId?:string|null;tenantId?:string|null}){
 const detail=input.error instanceof Error?input.error.stack??input.error.message:String(input.error??"");
 console.error(JSON.stringify({
  level:"error",incidentId:input.incidentId,code:input.code,location:input.location,
  userId:input.userId??null,tenantId:input.tenantId??null,detail,
  at:new Date().toISOString()
 }));
}
