import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import Link from "next/link";
export default async function OfflinePage(){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");
return <main style={{maxWidth:560,margin:"12vh auto",padding:24,fontFamily:"sans-serif"}}><h1>{translateUi("FOON — لا يوجد اتصال بالإنترنت")}</h1><p>{translateUi("تعذر تحميل هذه الصفحة. إذا كنت تستخدم نقطة البيع، افتح تبويب POS الذي سبق تحميله لعرض بياناته المحلية. الطلبات المحفوظة على هذا الجهاز لا تصل إلى المطعم حتى تكتمل مزامنتها.")}</p><p>{translateUi("لا تغلق أو تمسح بيانات المتصفح قبل التأكد من مزامنة جميع الطلبات.")}</p><Link href="/">{translateUi("إعادة المحاولة")}</Link></main>;}
