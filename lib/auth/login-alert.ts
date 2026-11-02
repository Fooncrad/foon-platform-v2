import {randomUUID} from "node:crypto";
import type {Pool,PoolConnection,RowDataPacket} from "mysql2/promise";

type LoginMethod="password"|"google"|"registration";
type MailLocale="ar"|"en"|"fr";
type LoginInfo={browser:string;device:string;city:string;occurredAt:string};
const unknown={ar:"غير متاحة",en:"Unavailable",fr:"Indisponible"};
const browsers=[
 [/EdgA?\//i,"Microsoft Edge"],[/OPR\//i,"Opera"],[/SamsungBrowser\//i,"Samsung Internet"],
 [/CriOS\//i,"Google Chrome"],[/Chrome\//i,"Google Chrome"],[/FxiOS\//i,"Firefox"],
 [/Firefox\//i,"Firefox"],[/Safari\//i,"Safari"]
] as const;
function safeCity(value:string|null){
 if(!value)return "";
 let city=value;
 try{city=decodeURIComponent(city);}catch{return "";}
 city=city.trim().replace(/[\r\n\t<>\\]/g,"");
 // Edge geo-city headers are optional and informational, never authentication signals.
 return city.length>=2&&city.length<=100&&!/^[0-9.: ]+$/.test(city)?city:"";
}
export function loginDeviceInfo(request:Request,locale:MailLocale="ar",now=new Date()):LoginInfo{
 const ua=(request.headers.get("user-agent")??"").slice(0,900);
 const browser=browsers.find(([pattern])=>pattern.test(ua))?.[1]??unknown[locale];
 const os=/Android/i.test(ua)?"Android":/iPhone|iPad|iPod/i.test(ua)?"iOS / iPadOS":/Windows/i.test(ua)?"Windows":/Macintosh|Mac OS X/i.test(ua)?"macOS":/Linux/i.test(ua)?"Linux":unknown[locale];
 const kind=/iPad|Tablet/i.test(ua)||(/Android/i.test(ua)&&!/Mobile/i.test(ua))?
  {ar:"جهاز لوحي",en:"Tablet",fr:"Tablette"}[locale]:
  /iPhone|iPod|Mobile|Android/i.test(ua)?
  {ar:"هاتف",en:"Phone",fr:"Téléphone"}[locale]:
  /Windows|Macintosh|Linux/i.test(ua)?
  {ar:"كمبيوتر",en:"Computer",fr:"Ordinateur"}[locale]:unknown[locale];
 // City headers are populated only on some supported proxies/CDNs.
 // Never infer a city from user input, IP guesses, or a browser-selected location.
 const city=safeCity(request.headers.get("cf-ipcity"))||
  safeCity(request.headers.get("x-vercel-ip-city"))||
  safeCity(request.headers.get("cloudfront-viewer-city"))||
  unknown[locale];
 const stamp=Number.isFinite(now.getTime())?now:new Date();
 const occurredAt=new Intl.DateTimeFormat(locale==="ar"?"ar-SA-u-nu-latn":locale==="fr"?"fr-FR":"en-GB",{
  calendar:"gregory",numberingSystem:"latn",timeZone:"Asia/Riyadh",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"
 }).format(stamp);
 return {browser,device:kind+" — "+os,city,occurredAt};
}
export function loginAlertCopy(locale:MailLocale,method:LoginMethod,info:LoginInfo){
 const how={
  ar:{password:"كلمة المرور",google:"Google",registration:"إنشاء حساب"},
  en:{password:"Password",google:"Google",registration:"Account registration"},
  fr:{password:"Mot de passe",google:"Google",registration:"Création de compte"}
 }[locale][method];
 if(locale==="en")return{
  subject:"New sign-in to your FOON account",
  text:"A sign-in to your FOON account was recorded.\n\nSign-in method: "+how+
   "\nBrowser: "+info.browser+"\nDevice: "+info.device+
   "\nTime (Saudi Arabia, UTC+03:00): "+info.occurredAt+
   "\nCity (approximate, when available): "+info.city+
   "\n\nIf this was not you, secure your account immediately. Never share verification codes or passwords."
 };
 if(locale==="fr")return{
  subject:"Nouvelle connexion à votre compte FOON",
  text:"Une connexion à votre compte FOON a été enregistrée.\n\nMéthode : "+how+
   "\nNavigateur : "+info.browser+"\nAppareil : "+info.device+
   "\nHeure (Arabie saoudite, UTC+03:00) : "+info.occurredAt+
   "\nVille (approximative, si disponible) : "+info.city+
   "\n\nSi ce n'était pas vous, sécurisez immédiatement votre compte. Ne communiquez jamais vos codes ou mots de passe."
 };
 return{
  subject:"تنبيه أمني: تسجيل دخول جديد إلى حسابك في FOON",
  text:"تم تسجيل دخول إلى حسابك في FOON.\n\nطريقة الدخول: "+how+
   "\nالمتصفح: "+info.browser+"\nالجهاز: "+info.device+
   "\nالوقت (بتوقيت السعودية UTC+03:00): "+info.occurredAt+
   "\nالمدينة (تقريبية عند توفرها): "+info.city+
   "\n\nإذا لم تكن أنت، أمّن حسابك فورًا وغيّر كلمة المرور أو راجع أمان حساب Google. لا تشارك رموز التحقق أو كلمة المرور."
 };
}
/** Queue security mail for the account owner only, after a committed successful login.
 * A mail outage must not roll back an authenticated session. */
export async function queueLoginAlert(db:Pool|PoolConnection,userId:string,request:Request,method:LoginMethod){
 try{
  const [rows]=await db.execute<RowDataPacket[]>(
   "SELECT email,default_locale FROM users WHERE id=? AND status='active' LIMIT 1",[userId]);
  const account=rows[0];if(!account)return false;
  const email=String(account.email??"");
  if(!/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/.test(email)||email.length>254)return false;
  const locale:MailLocale=account.default_locale==="en"||account.default_locale==="fr"?account.default_locale:"ar";
  const copy=loginAlertCopy(locale,method,loginDeviceInfo(request,locale));
  await db.execute("INSERT INTO platform_notification_outbox(id,event_key,recipient_email,subject,body_text) VALUES (?,'security_login',?,?,?)",
   [randomUUID(),email,copy.subject,copy.text]);
  return true;
 }catch{
  // The login succeeds even if SMTP/outbox is temporarily unavailable.
  console.error("LOGIN_SECURITY_ALERT_QUEUE_UNAVAILABLE");
  return false;
 }
}
