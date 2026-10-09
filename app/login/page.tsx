"use client";
import {type FormEvent,useEffect,useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
type Lang="ar"|"en"|"fr";
const strings={
 ar:{tag:"دخول آمن",title:"مرحبًا بعودتك",intro:"سجّل الدخول للوصول إلى مساحة العمل الخاصة بك.",email:"البريد الإلكتروني",password:"كلمة المرور",forgot:"نسيت كلمة المرور؟",busy:"جارٍ تسجيل الدخول…",submit:"تسجيل الدخول",noAccount:"ليس لديك حساب؟",register:"إنشاء حساب جديد",home:"العودة إلى الرئيسية",invalid:"البريد الإلكتروني أو كلمة المرور غير صحيحة.",rate:"محاولات كثيرة. حاول مرة أخرى لاحقًا.",failure:"تعذر تسجيل الدخول. حاول مجددًا.",network:"تعذر الاتصال بالخادم. حاول مجددًا.",language:"اللغة"},
 en:{tag:"Secure sign in",title:"Welcome back",intro:"Sign in to access your workspace.",email:"Email address",password:"Password",forgot:"Forgot your password?",busy:"Signing in…",submit:"Sign in",noAccount:"Don't have an account?",register:"Create an account",home:"Back to home",invalid:"Incorrect email or password.",rate:"Too many attempts. Please try again later.",failure:"Unable to sign in. Please try again.",network:"Unable to connect to the server. Please try again.",language:"Language"},
 fr:{tag:"Connexion sécurisée",title:"Bon retour",intro:"Connectez-vous pour accéder à votre espace de travail.",email:"Adresse e-mail",password:"Mot de passe",forgot:"Mot de passe oublié ?",busy:"Connexion…",submit:"Se connecter",noAccount:"Pas encore de compte ?",register:"Créer un compte",home:"Retour à l'accueil",invalid:"Adresse e-mail ou mot de passe incorrect.",rate:"Trop de tentatives. Réessayez plus tard.",failure:"Connexion impossible. Réessayez.",network:"Connexion au serveur impossible. Réessayez.",language:"Langue"}
} as const;
export default function LoginPage(){
 const router=useRouter();const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [lang,setLang]=useState<Lang>("ar");
 useEffect(()=>{const saved=localStorage.getItem("foon-public-lang");if(saved==="ar"||saved==="en"||saved==="fr")setLang(saved)},[]);
 const t=strings[lang];
 function changeLang(value:Lang){setLang(value);localStorage.setItem("foon-public-lang",value);setError("")}
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();if(busy)return;setBusy(true);setError("");const data=new FormData(e.currentTarget);
  try{
   const res=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:data.get("email"),password:data.get("password")})});
   const body=await res.json().catch(()=>({}));
   if(!res.ok){setError(body.code==="INVALID_CREDENTIALS"?t.invalid:body.code==="TOO_MANY_ATTEMPTS"?t.rate:t.failure);return;}
   router.replace("/account");router.refresh();
  }catch{setError(t.network)}finally{setBusy(false)}
 }
 return <main className="auth-shell foonAuthPage" dir={lang==="ar"?"rtl":"ltr"} lang={lang}><section className="auth-card"><div className="auth-heading"><Link href="/" className="auth-brand">FOON</Link><div className="foonAuthTopControls"><span className="foonAuthTag">✦ {t.tag}</span><select aria-label={t.language} value={lang} onChange={e=>changeLang(e.target.value as Lang)} className="foonAuthLanguage"><option value="ar">العربية</option><option value="en">English</option><option value="fr">Français</option></select></div></div><h1>{t.title}</h1><p>{t.intro}</p>
 <form onSubmit={submit} className="auth-form"><label>{t.email}<input name="email" type="email" inputMode="email" autoComplete="email" required dir="ltr" placeholder="name@example.com"/></label><label>{t.password}<input name="password" type="password" autoComplete="current-password" required minLength={9} dir="ltr" placeholder="•••••••••"/></label><Link href="/forgot-password">{t.forgot}</Link>{error&&<div className="form-error" role="alert">{error}</div>}<button disabled={busy} aria-busy={busy}>{busy?t.busy:t.submit}</button></form>
 <p className="auth-switch">{t.noAccount} <Link href="/register">{t.register}</Link></p><Link className="auth-home" href="/">{t.home}</Link></section></main>
}
