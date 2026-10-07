import {randomBytes} from "node:crypto";

export type PublicErrorCode=
 |"INVALID_INPUT"|"UNAUTHORIZED"|"FORBIDDEN"|"NOT_FOUND"|"CONFLICT"
 |"RATE_LIMITED"|"SERVICE_UNAVAILABLE"|"DATABASE_ERROR"|"INTERNAL_ERROR";

const messages:Record<PublicErrorCode,string>={
 INVALID_INPUT:"البيانات المدخلة غير صحيحة أو ناقصة.",
 UNAUTHORIZED:"يرجى تسجيل الدخول لإكمال العملية.",
 FORBIDDEN:"ليس لديك صلاحية لتنفيذ هذه العملية.",
 NOT_FOUND:"العنصر المطلوب غير موجود.",
 CONFLICT:"تعذر التنفيذ بسبب تعارض في البيانات.",
 RATE_LIMITED:"تمت محاولات كثيرة. حاول مرة أخرى بعد قليل.",
 SERVICE_UNAVAILABLE:"الخدمة غير متاحة مؤقتًا. حاول مرة أخرى.",
 DATABASE_ERROR:"تعذر الوصول إلى البيانات مؤقتًا.",
 INTERNAL_ERROR:"حدث خطأ غير متوقع. حاول مرة أخرى."
};

export function incidentId(){
 return randomBytes(4).toString("hex").toUpperCase();
}

export function publicError(code:PublicErrorCode,status:number,incident=incidentId()){
 return {ok:false,error:{code,message:messages[code],incidentId:incident,status}};
}

export function logIncident(input:{incidentId:string;code:string;location:string;error?:unknown;userId?:string|null;tenantId?:string|null}){
 const detail=input.error instanceof Error?input.error.stack??input.error.message:String(input.error??"");
 console.error(JSON.stringify({
  level:"error",incidentId:input.incidentId,code:input.code,location:input.location,
  userId:input.userId??null,tenantId:input.tenantId??null,detail,
  at:new Date().toISOString()
 }));
}
