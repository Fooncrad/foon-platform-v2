import {resolveWorkspace} from "@/lib/tenant/workspace";
import {activityWorkspaceUrl} from "@/lib/tenant/workspace-routes";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import PaymentEditor from "./payment-editor";
import AccountLanguageSwitcher from "../account-language-switcher";
import Link from "next/link";
import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
export default async function MerchantPaymentsPage({searchParams,params}:{searchParams:Promise<{tenant?:string}>;params?:Promise<{activity?:string}>}){
 const user=await currentUserId();if(!user)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;try{workspace=await resolveWorkspace(user,tenant);if(!["owner","manager","accountant"].includes(String(workspace.role)))throw Error();}catch{redirect("/account");}
 const tenantId=String(workspace.tenant_id),lang=(await cookies()).get("foon_language")?.value;
 const storedActivity=await tenantWorkspaceActivity(tenantId);
 if(!storedActivity)redirect("/business?tenant="+encodeURIComponent(tenantId));
 if(storedActivity!==((await params)?.activity??"restaurant"))redirect(activityWorkspaceUrl(storedActivity,tenantId));
 const t=(ar:string,en:string,fr:string)=>lang==="en"?en:lang==="fr"?fr:ar;
 const [[branches],[profiles]]=await Promise.all([
  database().execute<RowDataPacket[]>("SELECT id,name FROM branches WHERE tenant_id=? AND enabled=TRUE ORDER BY name",[tenantId]),
  database().execute<RowDataPacket[]>("SELECT activity_code,currency FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[tenantId])
 ]);
 return <main className="workspace" dir={lang==="en"||lang==="fr"?"ltr":"rtl"}><header className="workspace-head"><div><h1>{t("الدفع وبوابة النشاط","Business payments and gateway","Paiements et passerelle")}</h1><p>{String(workspace.name)}</p></div><AccountLanguageSwitcher/><Link href={activityWorkspaceUrl(storedActivity)}>{t("العودة للوحة النشاط","Back to business workspace","Retour au tableau de bord")}</Link></header><PaymentEditor key={tenantId} tenantId={tenantId} canEdit={["owner","manager"].includes(workspace.role)} activityCode={String(profiles[0]?.activity_code??"")} defaultCurrency={String(profiles[0]?.currency??"SAR")} branches={branches.map(b=>({id:String(b.id),name:String(b.name)}))}/></main>;
}
