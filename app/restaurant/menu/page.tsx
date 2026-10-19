import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import ActivityTemplateEditor from "../activity-template-editor";
import ActivityCatalogEditor from "../activity-catalog-editor";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {isActivityType} from "@/lib/platform/activity-presets";
import {activitySectionUrl,activityWorkspaceUrl} from "@/lib/tenant/workspace-routes";
import CanonicalTenantUrl from "../canonical-tenant-url";
import MenuCategoryEditor from "./category-editor";
import ItemEditor from "./item-editor";
import TemplateEditor from "./template-editor";
import BulkImport from "./bulk-import";
export default async function RestaurantMenuPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");

 const userId=await currentUserId();if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspace(userId,tenant)}catch{redirect("/account")}
 if(!["owner","manager"].includes(workspace.role)&&!workspace.adminAccess)redirect("/account");
 const [[profiles],[tenants]]=await Promise.all([database().execute<RowDataPacket[]>("SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[workspace.tenant_id]),database().execute<RowDataPacket[]>("SELECT slug FROM tenants WHERE id=? LIMIT 1",[workspace.tenant_id])]);
 const activity=String(profiles[0]?.activity_code??"restaurant");
 if(activity!=="restaurant"&&isActivityType(activity))redirect(activitySectionUrl(activity,"menu")+(tenant?"?tenant="+encodeURIComponent(workspace.tenant_id):""));
 if(activity!=="restaurant")return <main className="workspace foonMenuWorkspace"><CanonicalTenantUrl tenantId={workspace.tenant_id}/><h1>{translateUi("إدارة واجهة النشاط والأصناف")}</h1><p>{translateUi("اختر القالب ثم أضف الأقسام والمنتجات أو الخدمات بنفس خطوات منيو المطاعم.")}</p><nav aria-label="أقسام إدارة النشاط" className="foonMenuTabs"><a href="#activity-design">{translateUi("1. تصميم الواجهة")}</a><a href="#activity-catalog">{translateUi("2. الأقسام والأصناف")}</a></nav><section className="foonMenuStep" id="activity-design"><ActivityTemplateEditor tenantId={workspace.tenant_id} activity={activity} slug={String(tenants[0]?.slug??"")}/></section><section className="foonMenuStep" id="activity-catalog"><ActivityCatalogEditor tenantId={workspace.tenant_id} service={["carwash","laundry","automotive","salon","publicworks"].includes(activity)}/></section></main>;
 return <main className="workspace foonMenuWorkspace"><h1>{translateUi("إدارة المنيو والأصناف")}</h1><p>{translateUi("ابدأ باختيار مظهر المنيو، ثم أضف الأقسام والأصناف. كل تغيير محفوظ يظهر للعملاء حسب إعدادات النشر.")}</p><nav aria-label="أقسام إدارة المنيو" className="foonMenuTabs"><a href="#menu-design">{translateUi("1. تصميم المنيو")}</a><a href="#menu-categories">{translateUi("2. أقسام المنيو")}</a><a href="#menu-products">{translateUi("3. الأصناف والأسعار")}</a></nav><section className="foonMenuStep" id="menu-design"><TemplateEditor tenantId={workspace.tenant_id}/></section><section className="foonMenuStep" id="menu-categories"><MenuCategoryEditor tenantId={workspace.tenant_id}/><details><summary>{translateUi("استيراد الأقسام دفعة واحدة (CSV)")}</summary><BulkImport canonical tenantId={workspace.tenant_id} kind="categories"/></details></section><section className="foonMenuStep" id="menu-products"><ItemEditor tenantId={workspace.tenant_id}/><details><summary>{translateUi("استيراد الأصناف دفعة واحدة (CSV)")}</summary><BulkImport canonical tenantId={workspace.tenant_id} kind="items"/></details></section></main>;
}
