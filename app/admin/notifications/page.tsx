import NotificationOutbox from "./outbox";
import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import NotificationEditor from "./notification-editor";
export default async function NotificationsPage(){const user=await currentActiveAdminUserId();if(!user)redirect("/login");const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>الإشعارات والرسائل</h1><p>ضبط الأحداث وقنوات التنبيه لكل خدمة.</p></div></header><NotificationEditor canEdit={role!=="support"}/><NotificationOutbox/></main>;}
