import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import EmailTemplates from "./email-templates";
import NotificationOutbox from "./outbox";
import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import NotificationEditor from "./notification-editor";
export default async function NotificationsPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");
const user=await currentActiveAdminUserId();if(!user)redirect("/login");const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);return <main className="workspace"><header className="workspace-head"><div><h1>{translateUi("الإشعارات والرسائل")}</h1><p>{translateUi("ضبط الأحداث وقنوات التنبيه لكل خدمة.")}</p></div></header><NotificationEditor canEdit={role!=="support"}/><EmailTemplates canEdit={role!=="support"}/><NotificationOutbox/></main>;}
