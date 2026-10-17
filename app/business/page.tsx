import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {activityWorkspaceUrl} from "@/lib/tenant/workspace-routes";

// Backward compatibility for old /business links. The destination always
// comes from the authorized tenant's stored activity_code.
export default async function LegacyBusinessPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspace(userId,tenant);}catch{redirect("/account");}
 const activity=await tenantWorkspaceActivity(workspace.tenant_id);
 if(activity)redirect(activityWorkspaceUrl(activity,workspace.tenant_id));
 return <main lang="ar" dir="rtl" style={{maxWidth:640,margin:"6rem auto",padding:"1rem"}}>
  <h1>بيانات النشاط غير مكتملة</h1>
  <p>تعذر تحديد نوع النشاط المسجل لهذا المتجر. يرجى مراجعة إعدادات النشاط أو التواصل مع الدعم.</p>
 </main>;
}
