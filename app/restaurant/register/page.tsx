"use client";
import {useLanguagePreference} from "@/lib/i18n/ui-language";
import {useState,type FormEvent} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {registrationActivities} from "@/lib/tenant/registration-activities";
import {localizedActivityModules} from "@/lib/platform/activity-presets";
import {supportedCountries,countryRegions,currencyForCountry} from "@/lib/tenant/country-catalog";
export default function RestaurantRegisterPage(){
 const [lang]=useLanguagePreference(),router=useRouter();
 const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [activity,setActivity]=useState(""),[country,setCountry]=useState("SA"),[region,setRegion]=useState("الرياض");
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setError("");const data=new FormData(event.currentTarget);
  try{
   const response=await fetch("/api/restaurant/onboard",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name:data.get("name"),slug:data.get("slug"),activity,countryCode:country,currency:currencyForCountry(country),region,taxNumber:data.get("taxNumber")})});
   const result=await response.json().catch(()=>({}));
   if(response.ok){router.replace("/restaurant?tenant="+encodeURIComponent(result.tenant.id));router.refresh();return;}
   if(response.status===401){router.push("/login");return;}
   setError(result.code==="SLUG_EXISTS"?t("الرابط مستخدم، اختر رابطًا آخر.","This store URL is taken. Choose another.","Cette adresse est déjà utilisée. Choisissez-en une autre."):t("راجع بيانات النشاط والرابط والدولة والمدينة وحاول مجددًا.","Check the business details, URL, country and city, then try again.","Vérifiez les informations, l’adresse, le pays et la ville, puis réessayez."));
  }catch{setError(t("تعذر الاتصال بالخادم. حاول مجددًا.","Unable to connect. Please try again.","Connexion impossible. Réessayez."));}finally{setBusy(false);}
 }
 return <main className="auth-shell" dir={lang==="ar"?"rtl":"ltr"} lang={lang}><section className="auth-card">
  <Link href="/" className="auth-brand">FOON</Link><h1>{t("إنشاء نشاط جديد","Create a business","Créer une activité")}</h1>
  <p>{t("أنشئ نشاطك وفرعك الرئيسي بباقتك المجانية مباشرة دون موافقة الأدمن. سجّل الدخول بحسابك أولًا.","Create your business and main branch on the free plan without administrator approval. Sign in first.","Créez votre activité et votre établissement principal avec l’offre gratuite, sans validation administrative. Connectez-vous d’abord.")}</p>
  <form className="auth-form" onSubmit={submit}>
   <label>{t("نوع النشاط","Business type","Type d’activité")}<select name="activity" required value={activity} onChange={e=>setActivity(e.target.value)}><option value="" disabled>{t("اختر نشاطك","Choose your activity","Choisissez votre activité")}</option>{registrationActivities.map(a=><option key={a.id} value={a.id}>{a[lang]}</option>)}</select></label>
   {activity&&<section aria-live="polite"><strong>{t("الأدوات التشغيلية لنشاطك","Your operational tools","Outils de votre activité")}</strong><ul>{localizedActivityModules(activity,lang).map(m=><li key={m.code}>{m.label}</li>)}</ul></section>}
   <label>{t("اسم النشاط","Business name","Nom de l’activité")}<input name="name" required minLength={2} maxLength={180}/></label>
   <label>{t("رابط المتجر","Store URL","Adresse de la boutique")}<input name="slug" required minLength={3} maxLength={120} pattern="[a-z0-9][a-z0-9-]{1,118}[a-z0-9]" dir="ltr" placeholder="my-store"/></label>
   <label>{t("الدولة","Country","Pays")}<select name="countryCode" value={country} onChange={e=>{setCountry(e.target.value);setRegion(countryRegions[e.target.value]?.[0]??"");}}>{supportedCountries.map(c=><option key={c.code} value={c.code}>{c[lang]}</option>)}</select></label>
   <label>{t("العملة","Currency","Devise")}<input readOnly dir="ltr" value={currencyForCountry(country)??""}/></label>
   <label>{t("المنطقة / المدينة","Region / city","Région / ville")}{countryRegions[country]?<select required value={region} onChange={e=>setRegion(e.target.value)}>{countryRegions[country].map(r=><option key={r} value={r}>{r}</option>)}</select>:<input required minLength={2} maxLength={120} value={region} onChange={e=>setRegion(e.target.value)}/>}</label>
   <label>{t("الرقم الضريبي (اختياري)","Tax registration number (optional)","Numéro fiscal (facultatif)")}<input name="taxNumber" maxLength={64} dir="ltr"/></label>
   {error&&<div className="form-error" role="alert">{error}</div>}
   <button disabled={busy} aria-busy={busy}>{busy?t("جارٍ إنشاء النشاط…","Creating business…","Création en cours…"):t("إنشاء النشاط والفرع الرئيسي","Create business and main branch","Créer l’activité et l’établissement principal")}</button>
  </form>
  <p className="auth-switch"><Link href="/register">{t("إنشاء حساب جديد","Create account","Créer un compte")}</Link> · <Link href="/login">{t("تسجيل الدخول","Sign in","Se connecter")}</Link> · <Link href="/restaurant">{t("لوحة النشاط","Business workspace","Tableau de bord")}</Link></p>
 </section></main>;
}
