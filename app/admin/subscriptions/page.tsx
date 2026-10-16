import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import SubscriptionManager from "./subscription-manager";
export default async function SubscriptionsPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");

 const user=await currentActiveAdminUserId();if(!user)redirect("/login");
 const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);
 return <main className="workspace"><header className="workspace-head"><div><h1>{translateUi("إدارة اشتراكات الأنشطة")}</h1><p>{translateUi("تُفعّل الباقة المجانية تلقائياً عند إنشاء النشاط. إدارة الاشتراكات والترقيات من هنا.")}</p></div></header><SubscriptionManager canEdit={role!=="support"}/></main>;
}
