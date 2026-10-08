import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import SubscriptionManager from "./subscription-manager";
export default async function SubscriptionsPage(){
 const user=await currentActiveAdminUserId();if(!user)redirect("/login");
 const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);
 return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>إدارة اشتراكات الأنشطة</h1><p>ربط المطاعم والمتاجر بالباقات المسجلة والتحكم في حالة الاشتراك.</p></div></header><SubscriptionManager canEdit={role!=="support"}/></main>;
}
