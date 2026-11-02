import Link from "next/link";
import {cookies as uiCookies} from "next/headers";
import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {customerCreatorUserId} from "@/lib/creator/authorization";
import CreatorEditor from "./creator-editor";
import "./creator-editor.css";

export default async function CreatorProfilePage(){
 if(!await currentUserId())redirect("/login");
 if(!await customerCreatorUserId())redirect("/account");
 const rawLanguage=(await uiCookies()).get("foon_language")?.value;
 const language=rawLanguage==="en"||rawLanguage==="fr"?rawLanguage:"ar";
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 return <main className="creatorEditorPage" dir={language==="ar"?"rtl":"ltr"} lang={language}><nav aria-label={t("روابط بروفايل صانع المحتوى","Creator profile navigation","Navigation du profil créateur")}><Link href="/customer">{t("العودة لحساب العميل","Back to customer account","Retour au compte client")}</Link><Link href="/account/library">{t("مكتبة صوري","My photo library","Ma bibliothèque")}</Link></nav>
  <CreatorEditor/>
 </main>;
}
