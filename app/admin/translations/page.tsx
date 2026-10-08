import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import TranslationEditor from "./translation-editor";
export default async function TranslationsPage(){
 const user=await currentActiveAdminUserId();if(!user)redirect("/login");
 const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);
 return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>محرر الترجمات</h1><p>العربية · English · Français — البحث والتعديل والحفظ من قاعدة البيانات.</p></div></header><TranslationEditor canEdit={role!=="support"}/></main>;
}
