import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import MenuCategoryEditor from "./category-editor";
export default async function RestaurantMenuPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspace(userId,tenant)}catch{redirect("/account")}
 if(!["owner","manager"].includes(workspace.role)&&!workspace.adminAccess)redirect("/restaurant");
 return <main className="workspace" dir="rtl"><h1>إدارة أقسام المنيو</h1><p>أضف أقسام مطعمك أو المقهى، وستظهر الأقسام المفعّلة في المنيو العام.</p><MenuCategoryEditor tenantId={workspace.tenant_id}/></main>;
}
