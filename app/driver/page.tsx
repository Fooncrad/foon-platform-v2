import {redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {activitySectionUrl} from "@/lib/tenant/workspace-routes";

/** Driver entry never exposes a customer account or cross-tenant records. */
export default async function DriverPage(){
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 let workspace:Awaited<ReturnType<typeof resolveWorkspace>>;
 try{workspace=await resolveWorkspace(userId);}catch{redirect("/account");}
 if(workspace.role!=="driver"||workspace.adminAccess)redirect("/account");
 const activity=await tenantWorkspaceActivity(workspace.tenant_id);
 if(!activity)redirect("/account");
 redirect(activitySectionUrl(activity,"orders"));
}
