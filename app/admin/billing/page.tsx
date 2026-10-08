import {redirect} from "next/navigation";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import BillingManager from "./billing-manager";
export default async function BillingPage(){const user=await currentActiveAdminUserId();if(!user)redirect("/login");const {role}=await requirePlatformRole(user,["super_admin","admin","support"]);return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>المدفوعات والفواتير</h1><p>مراجعة طلبات التحويل البنكي مع سجل تدقيق لكل قرار.</p></div></header><BillingManager canEdit={role!=="support"}/></main>;}
