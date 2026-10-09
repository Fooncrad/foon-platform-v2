"use client";
import {useSavedPreference} from "@/lib/ui/saved-preference";
import {type FormEvent,useState} from "react";
import Link from "next/link";
type Lang="ar"|"en"|"fr";type Theme="light"|"dark";
const copy={
 ar:{tag:"استعادة الحساب",title:"نسيت كلمة المرور؟",intro:"أدخل بريد حسابك الإلكتروني لطلب رابط تعيين كلمة مرور جديدة.",email:"البريد الإلكتروني",send:"إرسال رابط الاستعادة",sending:"جارٍ الإرسال…",back:"العودة إلى تسجيل الدخول",success:"إذا كان البريد مسجلاً، ستصلك رسالة تحتوي على رابط الاستعادة.",failure:"تعذر إرسال رابط الاستعادة.",unavailable:"خدمة استعادة كلمة المرور غير مهيأة حاليًا. يرجى التواصل مع الدعم.",network:"تعذر الاتصال بالخادم. حاول مرة أخرى.",language:"اللغة",theme:"تبديل المظهر",code:"رمز الخطأ"},
 en:{tag:"Account recovery",title:"Forgot your password?",intro:"Enter your account email to request a password reset link.",email:"Email address",send:"Send reset link",sending:"Sending…",back:"Back to sign in",success:"If this email is registered, you will receive a password reset link.",failure:"Unable to send the reset link.",unavailable:"Password recovery is not configured yet. Please contact support.",network:"Unable to connect to the server. Please try again.",language:"Language",theme:"Toggle appearance",code:"Error code"},
 fr:{tag:"Récupération du compte",title:"Mot de passe oublié ?",intro:"Saisissez votre adresse e-mail pour demander un lien de réinitialisation.",email:"Adresse e-mail",send:"Envoyer le lien",sending:"Envoi…",back:"Retour à la connexion",success:"Si cette adresse est enregistrée, vous recevrez un lien de réinitialisation.",failure:"Impossible d'envoyer le lien.",unavailable:"La récupération du mot de passe n'est pas encore configurée. Contactez l'assistance.",network:"Connexion au serveur impossible. Réessayez.",language:"Langue",theme:"Changer l'apparence",code:"Code d'erreur"}
} as const;
export default function ForgotPasswordPage(){
 const [busy,setBusy]=useState(false);const [message,setMessage]=useState("");const [success,setSuccess]=useState(false);const [lang,setLang]=useSavedPreference<Lang>("foon-public-lang",["ar","en","fr"],"ar");const [theme,setTheme]=useSavedPreference<Theme>("foon-public-theme",["light","dark"],"light",true);
 const t=copy[lang];
 function changeLang(next:Lang){setLang(next);localStorage.setItem("foon-public-lang",next);setMessage("")}
 function toggleTheme(){const next=theme==="light"?"dark":"light";setTheme(next);localStorage.setItem("foon-public-theme",next)}
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();if(busy)return;setBusy(true);setMessage("");setSuccess(false);
  const form=new FormData(event.currentTarget);
  try{
   const response=await fetch("/api/auth/request-password-reset",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:form.get("email")})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok){const code=String(result.code??response.status);setMessage((code==="PASSWORD_RESET_NOT_CONFIGURED"?t.unavailable:t.failure)+" "+t.code+": "+code);return;}
   setSuccess(true);setMessage(t.success);
  }catch{setMessage(t.network)}finally{setBusy(false)}
 }
 return <main className="auth-shell foonAuthPage" data-theme={theme} dir={lang==="ar"?"rtl":"ltr"} lang={lang}><section className="auth-card">
  <div className="auth-heading"><Link href="/" className="auth-brand">FOON</Link><div className="foonAuthTopControls"><span className="foonAuthTag">✦ {t.tag}</span><button type="button" className="foonAuthThemeToggle" onClick={toggleTheme} aria-label={t.theme} aria-pressed={theme==="dark"}>{theme==="dark"?"☀":"☾"}</button><select className="foonAuthLanguage" aria-label={t.language} value={lang} onChange={e=>changeLang(e.target.value as Lang)}><option value="ar">العربية</option><option value="en">English</option><option value="fr">Français</option></select></div></div>
  <h1>{t.title}</h1><p>{t.intro}</p>
  <form className="auth-form" onSubmit={submit}><label>{t.email}<input name="email" type="email" autoComplete="email" inputMode="email" dir="ltr" required placeholder="name@example.com"/></label>
   {message&&<div className={success?"form-note":"form-error"} role="status">{message}</div>}
   <button disabled={busy} aria-busy={busy}>{busy?t.sending:t.send}</button></form>
  <p className="auth-switch"><Link href="/login">{t.back}</Link></p>
 </section></main>
}
