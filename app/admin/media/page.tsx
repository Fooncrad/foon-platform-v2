import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import MediaSettings from "./settings";
export default async function AdminMediaPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");
const id=await currentActiveAdminUserId();if(!id)redirect("/login");try{await requirePlatformRole(id,["super_admin"])}catch{redirect("/admin")}return <main className="workspace"><h1>{translateUi("إدارة مكتبة الصور")}</h1><p>{translateUi("تحكم في مساحة الصور وعددها لكل نوع حساب. الصور تحفظ في مكتبة خاصة بكل مستخدم.")}</p><MediaSettings/></main>}
