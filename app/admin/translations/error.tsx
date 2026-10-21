"use client";
import Link from "next/link";
import {useUiLanguage} from "@/lib/i18n/ui-language";
export default function TranslationsError({reset}:{error:Error & {digest?:string};reset:()=>void}){
 const language=useUiLanguage();
 const tr=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 return <main className="workspace"><section className="adminPanel" role="alert">
  <h1>{tr("تعذر فتح محرر الترجمات","Unable to open translations","Impossible d’ouvrir les traductions")}</h1>
  <p>{tr("حدث خطأ أثناء فتح الصفحة. أعد المحاولة أو ارجع إلى لوحة الإدارة. إذا استمر الخطأ، افحص اتصال قاعدة البيانات وجدول ui_translations.","The page could not load. Retry or return to the dashboard. If this continues, check the database and the ui_translations table.","La page n’a pas pu se charger. Réessayez ou revenez au tableau de bord. Vérifiez la base de données et la table ui_translations si le problème persiste.")}</p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
   <button type="button" onClick={reset}>{tr("إعادة المحاولة","Retry","Réessayer")}</button>
   <Link href="/admin">{tr("العودة إلى الإدارة","Back to dashboard","Retour à l’administration")}</Link>
  </div>
 </section></main>;
}
