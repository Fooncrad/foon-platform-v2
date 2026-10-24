"use client";
import {useLanguagePreference} from "@/lib/i18n/ui-language";
import {useSavedPreference} from "@/lib/ui/saved-preference";
import {type FormEvent,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {getSystemMessage} from "@/lib/ui/system-messages";
import RequiredLegalConsent from "@/app/components/required-legal-consent";
type Lang="ar"|"en"|"fr";
type Theme="light"|"dark";
const strings={
 ar:{tag:"دخول آمن",title:"مرحبًا بعودتك",intro:"سجّل الدخول للوصول إلى مساحة العمل الخاصة بك.",email:"البريد الإلكتروني",password:"كلمة المرور",forgot:"نسيت كلمة المرور؟",busy:"جارٍ تسجيل الدخول…",submit:"تسجيل الدخول",noAccount:"ليس لديك حساب؟",register:"إنشاء حساب جديد",home:"العودة إلى الرئيسية",invalid:"البريد الإلكتروني أو كلمة المرور غير صحيحة.",rate:"محاولات كثيرة. حاول مرة أخرى لاحقًا.",failure:"تعذر تسجيل الدخول. حاول مجددًا.",network:"تعذر الاتصال بالخادم. حاول مجددًا.",language:"اللغة"},
 en:{tag:"Secure sign in",title:"Welcome back",intro:"Sign in to access your workspace.",email:"Email address",password:"Password",forgot:"Forgot your password?",busy:"Signing in…",submit:"Sign in",noAccount:"Don't have an account?",register:"Create an account",home:"Back to home",invalid:"Incorrect email or password.",rate:"Too many attempts. Please try again later.",failure:"Unable to sign in. Please try again.",network:"Unable to connect to the server. Please try again.",language:"Language"},
 fr:{tag:"Connexion sécurisée",title:"Bon retour",intro:"Connectez-vous pour accéder à votre espace de travail.",email:"Adresse e-mail",password:"Mot de passe",forgot:"Mot de passe oublié ?",busy:"Connexion…",submit:"Se connecter",noAccount:"Pas encore de compte ?",register:"Créer un compte",home:"Retour à l'accueil",invalid:"Adresse e-mail ou mot de passe incorrect.",rate:"Trop de tentatives. Réessayez plus tard.",failure:"Connexion impossible. Réessayez.",network:"Connexion au serveur impossible. Réessayez.",language:"Langue"}
} as const;
export default function LoginPage(){
 const router=useRouter();const [error,setError]=useState("");const [errorCode,setErrorCode]=useState("");const [busy,setBusy]=useState(false);const [googleBusy,setGoogleBusy]=useState(false);const [googleAccepted,setGoogleAccepted]=useState(false);const [googleFailure,setGoogleFailure]=useState("");const [lang]=useLanguagePreference();const [theme]=useSavedPreference<Theme>("foon-public-theme",["light","dark"],"light",true);
 const t=strings[lang]; const googleError=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("error"):null;
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setError("");setErrorCode("");const data=new FormData(e.currentTarget);
  try{
   const res=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:data.get("email"),password:data.get("password")})});
   const body=await res.json().catch(()=>({}));
   if(!res.ok){const code=body.code==="INVALID_CREDENTIALS"?"LOGIN_INVALID":body.code==="TOO_MANY_ATTEMPTS"?"LOGIN_RATE_LIMIT":"ACTION_FAILED";setErrorCode(code);setError(getSystemMessage(code,lang).detail);return;}
   if(body.emailVerificationRequired){router.replace("/verify-email");router.refresh();return;}
   const next=new URLSearchParams(window.location.search).get("next");router.replace(next&&/^\/receipts\/[a-f0-9-]{36}(?:\?view=pos)?$/i.test(next)?next:"/account");router.refresh();
  }catch{setErrorCode("NETWORK_ERROR");setError(getSystemMessage("NETWORK_ERROR",lang).detail)}finally{setBusy(false)}
 }
 async function googleSignIn(){
  if(!googleAccepted||googleBusy)return;
  setGoogleBusy(true);setGoogleFailure("");
  try{
   const response=await fetch("/api/auth/google/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({legalAccepted:googleAccepted})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||typeof result.url!=="string"||!result.url.startsWith("https://accounts.google.com/o/oauth2/v2/auth?")){setGoogleFailure(String(result.code||"GOOGLE_NOT_CONFIGURED"));return;}
   window.location.assign(result.url);
  }catch{setGoogleFailure("NETWORK_ERROR");}finally{setGoogleBusy(false);}
 }
 return <main className="auth-shell foonAuthPage" data-theme={theme} dir={lang==="ar"?"rtl":"ltr"} lang={lang}><section className="auth-card"><div className="auth-heading"><span className="foonAuthTag">✦ {t.tag}</span></div><h1>{t.title}</h1><p>{t.intro}</p>
 <form onSubmit={submit} className="auth-form"><label>{t.email}<input name="email" type="email" inputMode="email" autoComplete="email" required dir="ltr" placeholder="name@example.com"/></label><label>{t.password}<input name="password" type="password" autoComplete="current-password" required minLength={9} dir="ltr" placeholder="•••••••••"/></label><Link href="/forgot-password">{t.forgot}</Link>{error&&<div className="form-error" role="alert"><strong>{getSystemMessage(errorCode,lang).title}</strong><p>{error}</p><small dir="ltr">{errorCode}</small></div>}<button disabled={busy} aria-busy={busy}>{busy?t.busy:t.submit}</button></form>
 <RequiredLegalConsent language={lang} name="googleLegalConsent" checked={googleAccepted} onChange={setGoogleAccepted}/>
 <button type="button" disabled={!googleAccepted||googleBusy} aria-busy={googleBusy} onClick={googleSignIn} style={{display:"flex",justifyContent:"center",alignItems:"center",gap:12,padding:"12px",border:"1px solid var(--border, #999)",borderRadius:12,textDecoration:"none",marginTop:16,fontWeight:600,cursor:"pointer",width:"100%"}}><span aria-hidden="true" style={{fontWeight:800}}>G</span>{lang==="ar"?"المتابعة باستخدام Google":lang==="fr"?"Continuer avec Google":"Continue with Google"}</button>{googleFailure&&<p className="form-error" role="alert">{lang==="ar"?"تعذر بدء تسجيل Google. تحقق من إعداداته وحاول مجددًا.":lang==="fr"?"Impossible de démarrer Google. Vérifiez la configuration.":"Unable to start Google sign-in. Check the settings."} <small dir="ltr">{googleFailure}</small></p>}{googleError&&<p className="form-error" role="alert">{getSystemMessage(googleError,lang).detail} <small dir="ltr">{googleError}</small></p>}<p className="auth-switch">{t.noAccount} <Link href="/register">{t.register}</Link></p><Link className="auth-home" href="/">{t.home}</Link></section></main>
}
