import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import SettingsEditor from "./settings-editor";
import IntegrationSettings from "./integration-settings";
export default async function SettingsPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");

 const user=await currentActiveAdminUserId();if(!user)redirect("/login");
 const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);
 return <main className="workspace"><header className="workspace-head"><div><h1>{translateUi("إعدادات المنصة")}</h1><p>{translateUi("إدارة الهوية والتواصل واللغة الافتراضية من قاعدة البيانات.")}</p></div></header><SettingsEditor canEdit={role!=="support"}/><IntegrationSettings canEdit={role!=="support"}/></main>;
}
