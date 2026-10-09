import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import MenuCategoryEditor from "./category-editor";
import ItemEditor from "./item-editor";
import TemplateEditor from "./template-editor";
import BulkImport from "./bulk-import";
export default async function RestaurantMenuPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspace(userId,tenant)}catch{redirect("/account")}
 if(!["owner","manager"].includes(workspace.role)&&!workspace.adminAccess)redirect("/restaurant");
 return <main className="workspace foonMenuWorkspace" dir="rtl"><h1>إدارة المنيو والأصناف</h1><p>ابدأ باختيار مظهر المنيو، ثم أضف الأقسام والأصناف. كل تغيير محفوظ يظهر للعملاء حسب إعدادات النشر.</p><nav aria-label="أقسام إدارة المنيو" className="foonMenuTabs"><a href="#menu-design">1. تصميم المنيو</a><a href="#menu-categories">2. أقسام المنيو</a><a href="#menu-products">3. الأصناف والأسعار</a></nav><section className="foonMenuStep" id="menu-design"><TemplateEditor tenantId={workspace.tenant_id}/></section><section className="foonMenuStep" id="menu-categories"><MenuCategoryEditor tenantId={workspace.tenant_id}/><details><summary>استيراد الأقسام دفعة واحدة (CSV)</summary><BulkImport tenantId={workspace.tenant_id} kind="categories"/></details></section><section className="foonMenuStep" id="menu-products"><ItemEditor tenantId={workspace.tenant_id}/><details><summary>استيراد الأصناف دفعة واحدة (CSV)</summary><BulkImport tenantId={workspace.tenant_id} kind="items"/></details></section></main>;
}
