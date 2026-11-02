import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import TranslationEditor from "./translation-editor";
export default async function TranslationsPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");

 const user=await currentActiveAdminUserId();if(!user)redirect("/login");
 const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);
 return <main className="workspace"><header className="workspace-head"><div><h1>{translateUi("محرر الترجمات")}</h1><p>{translateUi("العربية · English · Français — البحث والتعديل والحفظ من قاعدة البيانات.")}</p></div></header><TranslationEditor canEdit={role!=="support"}/></main>;
}
