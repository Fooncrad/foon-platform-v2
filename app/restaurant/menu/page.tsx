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
 return <main className="workspace" dir="rtl"><h1>إدارة المنيو</h1><p>أدر القالب والأقسام والأصناف من مساحة واحدة دون تكرار الأدوات.</p><nav aria-label="أقسام إدارة المنيو" style={{display:"flex",gap:8,flexWrap:"wrap",marginBlock:16}}><a href="#menu-design">القالب والمظهر</a><a href="#menu-categories">الأقسام واستيرادها</a><a href="#menu-products">الأصناف واستيرادها</a></nav><section id="menu-design"><TemplateEditor tenantId={workspace.tenant_id}/></section><section id="menu-categories"><MenuCategoryEditor tenantId={workspace.tenant_id}/><details><summary>استيراد الأقسام دفعة واحدة (CSV)</summary><BulkImport tenantId={workspace.tenant_id} kind="categories"/></details></section><section id="menu-products"><ItemEditor tenantId={workspace.tenant_id}/><details><summary>استيراد الأصناف دفعة واحدة (CSV)</summary><BulkImport tenantId={workspace.tenant_id} kind="items"/></details></section></main>;
}
