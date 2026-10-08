import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import PagesEditor from "./pages-editor";
export default async function PagesPage(){
 const user=await currentActiveAdminUserId();if(!user)redirect("/login");
 const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);
 return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>صفحات الموقع</h1><p>إنشاء الصفحات والمسودات والمحتوى بالعربية والإنجليزية والفرنسية.</p></div></header><PagesEditor canEdit={role!=="support"}/></main>;
}
