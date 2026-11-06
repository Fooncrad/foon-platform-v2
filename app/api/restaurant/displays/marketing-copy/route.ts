import {NextResponse} from "next/server";
import {currentUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {assertSameOrigin} from "@/lib/security/origin";
import {readLimitedJson} from "@/lib/security/limited-json";
import {tenantEntitlement} from "@/lib/plans/entitlements";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{"Cache-Control":"no-store"}});
const clean=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):"";

export async function POST(req:Request){
 try{assertSameOrigin(req);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 const user=await currentUserId();if(!user)return reply({ok:false,code:"UNAUTHENTICATED"},401);
 const tenant=req.headers.get("x-foon-tenant")??"";if(!tenant)return reply({ok:false,code:"TENANT_REQUIRED"},400);
 try{await requireTenantMembership(user,tenant,["owner","manager"],true);}catch{return reply({ok:false,code:"FORBIDDEN"},403);}
 let body:Record<string,unknown>;try{body=await readLimitedJson(req,4096) as Record<string,unknown>;}catch{return reply({ok:false,code:"INVALID_INPUT"},400);}
 const purpose=body.purpose==="menu_description"?"menu_description":"display_copy";
 if(purpose==="display_copy"){
  try{if(!(await tenantEntitlement(tenant,"display_advertising")).enabled)return reply({ok:false,code:"PLAN_FEATURE_REQUIRED"},403);}catch{return reply({ok:false,code:"ENTITLEMENT_UNAVAILABLE"},503);}
 }
 const product=clean(body.productName,180),description=clean(body.description,500),activity=clean(body.activityType,80),category=clean(body.category,100),price=clean(body.price,40),currency=clean(body.currency,8);
 const language=body.language==="en"||body.language==="fr"?body.language:"ar";
 if(!product)return reply({ok:false,code:"PRODUCT_NAME_REQUIRED"},400);
 const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)return reply({ok:false,code:"AI_NOT_CONFIGURED"},503);
 const model=clean(process.env.OPENAI_MODEL,80)||"gpt-4o-mini";
 const menu=purpose==="menu_description";
 const prompt=menu?[
  "You are FOON's multilingual product and service description assistant.",
  "Write a natural, appealing menu/catalog description matching the exact supplied item and activity.",
  "Never invent ingredients, materials, sizes, origin, certifications, health claims, availability, delivery promises, discounts or benefits.",
  "Use only supplied facts. If facts are sparse, write a tasteful short description without asserting specifics.",
  "Return JSON with descriptionAr, descriptionEn, descriptionFr. Each description should be 1-2 concise sentences.",
  "Keep proper names unchanged and do not add prices unless explicitly supplied.",
  JSON.stringify({activityType:activity,category,productName:product,description,price,currency,requestedLanguage:language})
 ].join("\n"):[
  "You are FOON's concise digital-signage copywriter.",
  "Create truthful, attractive advertising copy for a business display.",
  "Never invent discounts, ingredients, certifications, availability, delivery promises, ratings or product benefits.",
  "Use only supplied facts. If price is supplied, show it exactly. Keep Arabic natural and suitable for a large screen.",
  "Return only JSON with keys titleAr, subtitleAr, badgeAr, titleEn, subtitleEn, badgeEn, titleFr, subtitleFr, badgeFr.",
  "Titles: 2-7 words; subtitles: max 14 words; badges: max 4 words. Leave unsupported translations empty rather than guessing proper names.",
  "Do not include markdown or explanations.",
  JSON.stringify({activityType:activity,category,productName:product,description,price,currency})
 ].join("\n");
 try{
  const response=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"authorization":"Bearer "+apiKey,"content-type":"application/json"},body:JSON.stringify({model,temperature:0.7,max_tokens:menu?300:450,response_format:{type:"json_object"},messages:[{role:"system",content:"Return valid JSON only."},{role:"user",content:prompt}]}),signal:AbortSignal.timeout(20000)});
  if(!response.ok)return reply({ok:false,code:response.status===429?"AI_BUSY":"AI_PROVIDER_ERROR"},503);
  const payload=await response.json() as {choices?:{message?:{content?:string}}[]};
  const raw=payload.choices?.[0]?.message?.content;if(typeof raw!=="string")return reply({ok:false,code:"AI_EMPTY_RESPONSE"},503);
  const parsed=JSON.parse(raw) as Record<string,unknown>;
  if(menu){
   const copy={descriptionAr:clean(parsed.descriptionAr,5000),descriptionEn:clean(parsed.descriptionEn,5000),descriptionFr:clean(parsed.descriptionFr,5000)};
   if(!copy.descriptionAr&&!copy.descriptionEn&&!copy.descriptionFr)return reply({ok:false,code:"AI_INVALID_RESPONSE"},503);
   return reply({ok:true,purpose,copy,model});
  }
  const fields=["titleAr","subtitleAr","badgeAr","titleEn","subtitleEn","badgeEn","titleFr","subtitleFr","badgeFr"] as const;
  const copy=Object.fromEntries(fields.map(key=>[key,clean(parsed[key],key.startsWith("title")?100:key.startsWith("subtitle")?180:60)]));
  if(!copy.titleAr||!copy.subtitleAr)return reply({ok:false,code:"AI_INVALID_RESPONSE"},503);
  return reply({ok:true,purpose,copy,model});
 }catch{return reply({ok:false,code:"AI_GENERATION_FAILED"},503);}
}
