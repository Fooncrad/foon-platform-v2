"use client";
import {useEffect,useState} from "react";
import CreatorSocialIcon from "@/app/components/creator-social-icon";
import {CREATOR_SOCIAL_PLATFORMS,type CreatorSocialPlatform} from "@/lib/creator/social-links";
import {useUiLanguage} from "@/lib/i18n/ui-language";

type LinkState=Partial<Record<CreatorSocialPlatform,string>>;
export default function CreatorSocialLinksEditor({ready}:{ready:boolean}){
 const locale=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>locale==="en"?en:locale==="fr"?fr:ar;
 const [values,setValues]=useState<LinkState>({}),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;
  fetch("/api/account/creator-social-links",{cache:"no-store"}).then(async r=>{
   const d=await r.json();
   if(!r.ok||!d.ok||!Array.isArray(d.links))throw Error("SOCIAL_LINKS_UNAVAILABLE");
   if(active)setValues(Object.fromEntries(d.links.map((l:{platform:CreatorSocialPlatform;url:string})=>[l.platform,l.url])));
  }).catch(()=>{if(active)setError(t("تعذر تحميل روابط التواصل.","Could not load social links.","Chargement des liens impossible."));})
  .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[]);
 async function save(){
  setBusy(true);setError("");setMessage("");
  try{
   const links=CREATOR_SOCIAL_PLATFORMS.flatMap(p=>{
    const url=values[p.key]?.trim();
    return url?[{platform:p.key,url}]:[];
   });
   const r=await fetch("/api/account/creator-social-links",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({links})});
   const data=await r.json();
   if(!r.ok)throw Error(String(data.code??"SOCIAL_LINKS_SAVE_FAILED"));
   setValues(Object.fromEntries(data.links.map((l:{platform:CreatorSocialPlatform;url:string})=>[l.platform,l.url])));
   setMessage(t("تم حفظ روابط التواصل. لن تظهر للزوار إلا عندما يكون ملفك عامًا.","Social links saved. Visitors see them only when your profile is public.","Liens enregistrés. Ils ne sont visibles que si le profil est public."));
  }catch(e){
   const code=e instanceof Error?e.message:"SOCIAL_LINKS_SAVE_FAILED";
   setError(code==="INVALID_SOCIAL_LINK"?t("الرابط غير صحيح. استخدم رابط HTTPS الرسمي لكل منصة ورابط حسابك تحديدًا.","Invalid link: use your own profile's official HTTPS URL.","Lien invalide : utilisez une adresse HTTPS officielle de votre profil."):code);
  }finally{setBusy(false);}
 }
 return <section className="creatorSocialEditor" aria-label={t("روابط التواصل الاجتماعي","Social media links","Liens sociaux")}>
  <h2>{t("روابط التواصل الاجتماعي","Social profiles & contact links","Réseaux sociaux et contacts")}</h2>
  <p>{t("أضف روابط حساباتك. تظهر بأيقونات حديثة في ملفك العام فقط، ولا تظهر أي روابط عندما تختار خاص.","Add your social profile URLs. Modern icons appear only on a public creator profile.","Ajoutez les liens de vos comptes. Ils sont visibles uniquement sur votre profil public.")}</p>
  {loading?<p role="status">{t("جارٍ التحميل…","Loading…","Chargement…")}</p>:<>
   <div className="creatorSocialInputs">
    {CREATOR_SOCIAL_PLATFORMS.map(p=><label key={p.key}>
     <span className="creatorSocialInputLabel"><CreatorSocialIcon platform={p.key}/>{p.label}</span>
     <input type="url" dir="ltr" autoComplete="url" maxLength={512} placeholder={p.placeholder} value={values[p.key]??""} disabled={busy} onChange={e=>setValues(v=>({...v,[p.key]:e.target.value}))}/>
    </label>)}
   </div>
   <button type="button" disabled={busy||!ready} onClick={()=>void save()}>{busy?t("جارٍ الحفظ…","Saving…","Enregistrement…"):t("حفظ روابط التواصل","Save social links","Enregistrer les liens")}</button>
   {!ready&&<p>{t("احفظ ملف صانع المحتوى أولًا لتفعيل الروابط.","Save the creator profile first to enable social links.","Enregistrez d'abord votre profil créateur.")}</p>}
   {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  </>}
 </section>;
}
