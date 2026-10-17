import {notFound,redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {activityWorkspaceUrl} from "@/lib/tenant/workspace-routes";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {isActivityType} from "@/lib/platform/activity-presets";
import MerchantWorkspace from "../../restaurant/page";

export default async function ActivityWorkspacePage({
 params,searchParams
}:{params:Promise<{activity:string}>;searchParams:Promise<{tenant?:string}>}){
 const {activity}=await params;
 if(!isActivityType(activity))notFound();
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 const requested=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspace(userId,requested.tenant);}catch{redirect("/account");}
 const actual=await tenantWorkspaceActivity(workspace.tenant_id);
 if(!actual)notFound();
 // A URL cannot elevate access or select another activity. Membership is
 // resolved before reading the stored activity; mismatch returns to its own ID.
 if(activity!==actual)redirect(activityWorkspaceUrl(actual,workspace.tenant_id));
 return <MerchantWorkspace searchParams={Promise.resolve({tenant:workspace.tenant_id})}/>;
}
