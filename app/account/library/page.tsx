import {isEmployeeAccount} from "@/lib/auth/account-surface";
import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import Link from "next/link";
import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import MediaLibrary from "./media-library";
import "./style.css";
export default async function LibraryPage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");

 const user=await currentUserId();if(!user)redirect("/login");
 if(await isEmployeeAccount(user))redirect("/restaurant");
 return <main className="foonMediaPage"><nav><Link href="/account">{translateUi("حسابي")}</Link><Link href="/customer">{translateUi("حساب العميل")}</Link><Link href="/restaurant">{translateUi("لوحة النشاط")}</Link><Link href="/admin">{translateUi("لوحة الإدارة")}</Link></nav><h1>{translateUi("مكتبة الصور")}</h1><MediaLibrary/></main>
}
