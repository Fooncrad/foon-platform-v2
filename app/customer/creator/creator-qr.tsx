"use client";
import {useState} from "react";
import {useUiLanguage} from "@/lib/i18n/ui-language";
export default function CreatorQr({handle}:{handle:string}){
 const locale=useUiLanguage();
 const t=(ar:string,en:string,fr:string)=>locale==="en"?en:locale==="fr"?fr:ar;
 const [copied,setCopied]=useState(false);
 const url="/creators/"+encodeURIComponent(handle);
 const qr="/api/creators/"+encodeURIComponent(handle)+"/qr";
 return <section className="creatorQrPanel">
  <div><h2>{t("رمز QR لملفي العام","My public profile QR code","QR de mon profil public")}</h2>
   <p>{t("أي شخص يمسح هذا الرمز بكاميرا جواله يفتح ملفك العام مباشرة.","Anyone can scan this QR code to open your public creator profile.","Tout le monde peut scanner ce QR pour ouvrir votre profil public.")}</p>
   <p className="creatorPrivacyHint">{t("عند تحويل الملف إلى خاص يصبح الرابط والـ QR غير قادرين على عرض الملف.","Switching to Private blocks access even from an already saved QR code.","Le passage en privé bloque aussi les QR déjà enregistrés.")}</p>
  </div>
  <img src={qr} alt={t("رمز QR لملف صانع المحتوى","QR code linking to creator profile","QR du profil créateur")} width={240} height={240}/>
  <div className="creatorQrActions">
   <a href={qr} download={"foon-"+handle+"-qr.svg"}>{t("حفظ QR","Save QR","Enregistrer le QR")}</a>
   <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(new URL(url,window.location.origin).toString());setCopied(true);}catch{setCopied(false);}}}>{copied?t("تم نسخ الرابط","Link copied","Lien copié"):t("نسخ رابط الملف","Copy profile link","Copier le lien")}</button>
  </div>
 </section>;
}
