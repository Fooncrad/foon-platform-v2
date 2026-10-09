import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import MediaSettings from "./settings";
export default async function AdminMediaPage(){const id=await currentActiveAdminUserId();if(!id)redirect("/login");try{await requirePlatformRole(id,["super_admin"])}catch{redirect("/admin")}return <main className="workspace" dir="rtl"><h1>إدارة مكتبة الصور</h1><p>تحكم في مساحة الصور وعددها لكل نوع حساب. الصور تحفظ في مكتبة خاصة بكل مستخدم.</p><MediaSettings/></main>}
