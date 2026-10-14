import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {database} from "@/lib/db/mysql";
import {isActivityType} from "@/lib/platform/activity-presets";
import type {RowDataPacket} from "mysql2/promise";
import ActivityCatalogEditor from "../activity-catalog-editor";
import ActivityTemplateEditor from "../activity-template-editor";

/** Activity setup is tenant-scoped and available only to store owners/managers. */
export default async function ActivitySetupPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace:Awaited<ReturnType<typeof resolveWorkspace>>;
 try{workspace=await resolveWorkspace(userId,tenant)}catch{redirect("/account")}
 if(!["owner","manager"].includes(workspace.role))redirect("/restaurant");
 const [profiles]=await database().execute<RowDataPacket[]>(
  "SELECT activity_code FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",
  [workspace.tenant_id]
 );
 const activity=String(profiles[0]?.activity_code??"");
 if(!isActivityType(activity)||activity==="restaurant")redirect("/restaurant");
 const service=["carwash","laundry","automotive","salon","publicworks"].includes(activity);
 const [tenants]=await database().execute<RowDataPacket[]>("SELECT slug FROM tenants WHERE id=? LIMIT 1",[workspace.tenant_id]);
 const slug=String(tenants[0]?.slug??"");
 return <main dir="rtl" style={{maxWidth:1100,margin:"0 auto",padding:"24px 16px"}}>
  <a href={"/restaurant?tenant="+encodeURIComponent(workspace.tenant_id)}>العودة إلى لوحة المتجر</a>
  <h1>إعداد نشاط {workspace.name}</h1>
  <p>إدارة {service?"الخدمات":"المنتجات"} والأقسام وقالب الواجهة العامة.</p>
  <ActivityCatalogEditor tenantId={workspace.tenant_id} service={service}/>
  <ActivityTemplateEditor tenantId={workspace.tenant_id} activity={activity} slug={slug}/>
 </main>;
}
