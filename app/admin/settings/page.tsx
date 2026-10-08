import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import SettingsEditor from "./settings-editor";
export default async function SettingsPage(){
 const user=await currentActiveAdminUserId();if(!user)redirect("/login");
 const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);
 return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>إعدادات المنصة</h1><p>إدارة الهوية والتواصل واللغة الافتراضية من قاعدة البيانات.</p></div></header><SettingsEditor canEdit={role!=="support"}/></main>;
}
