"use client";
import {useUiLanguage} from "@/lib/i18n/ui-language";
import {useEffect,useState} from "react";
export default function PaymentButton({orderId,completed=false}:{orderId:string;completed?:boolean}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(""),[done,setDone]=useState(completed);
 const lang=useUiLanguage();

 const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 async function pay(){
  if(busy||done)return;setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/customer/payments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({orderId})}),data=await r.json();
   if(!r.ok)throw Error(data.code);
   if(data.state==="test_completed"){setDone(true);return;}
   const url=new URL(data.url);
   if(data.mode!=="test"||url.protocol!=="https:"||url.username||url.password||url.port||!(url.hostname==="tap.company"||url.hostname.endsWith(".tap.company")))throw Error("CHECKOUT_UNAVAILABLE");
   window.location.assign(url.href);
  }catch(error){setMessage(error instanceof Error?error.message:"CHECKOUT_UNAVAILABLE");}finally{setBusy(false);}
 }
 const errors:Record<string,string>={
  CHECKOUT_REVIEW_REQUIRED:t("هذه العملية تحتاج مراجعة التاجر قبل المحاولة مجددًا.","This payment needs merchant review before retrying.","Ce paiement nécessite une vérification du marchand."),
  CHECKOUT_UNCERTAIN:t("تعذر التأكد من إنشاء العملية. أعد المحاولة لاستكمال نفس العملية.","Creation could not be confirmed. Retry to resume the same payment.","Création non confirmée. Réessayez pour reprendre le même paiement."),
  CHECKOUT_NOT_ENABLED:t("الدفع التجريبي غير مفعّل لهذا الفرع.","Test payment is not enabled for this branch.","Le paiement test est désactivé pour cette succursale."),
  ORDER_NOT_PAYABLE:t("حالة الطلب تغيّرت. حدّث الصفحة.","The order changed. Refresh the page.","La commande a changé. Actualisez la page."),
  UNAUTHENTICATED:t("سجل الدخول لاستكمال الدفع.","Sign in to continue payment.","Connectez-vous pour continuer.")
 };
 return <div className="customerPaymentAction">{done?<p role="status">{t("تم التحقق من الدفع التجريبي · الطلب ما زال غير مدفوع فعليًا","Test payment verified · order remains unpaid","Paiement test vérifié · commande toujours impayée")}</p>:<><button type="button" disabled={busy} onClick={()=>void pay()}>{busy?t("جارٍ تجهيز الدفع…","Preparing payment…","Préparation…"):t("اختبار الدفع عبر Tap","Test payment with Tap","Tester le paiement Tap")}</button><small>{t("وضع الاختبار · دون تحصيل فعلي","Test mode · no actual collection","Mode test · aucun encaissement réel")}</small></>}{message&&<p role="alert">{errors[message]??t("تعذر تجهيز الدفع. حاول مرة أخرى.","Payment could not be prepared. Please retry.","Préparation impossible. Réessayez.")}</p>}</div>;
}
