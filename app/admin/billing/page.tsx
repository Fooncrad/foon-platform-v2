import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import Receipts from "./receipts";
import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import BillingManager from "./billing-manager";
export default async function BillingPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");
const user=await currentActiveAdminUserId();if(!user)redirect("/login");const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);return <main className="workspace"><header className="workspace-head"><div><h1>{translateUi("المدفوعات والفواتير")}</h1><p>{translateUi("مراجعة طلبات التحويل البنكي مع سجل تدقيق لكل قرار.")}</p></div></header><BillingManager canEdit={role!=="support"}/><Receipts/></main>;}
