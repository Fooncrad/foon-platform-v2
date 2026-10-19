import {notFound,redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {activityPaymentsUrl} from "@/lib/tenant/workspace-routes";
import {isActivityType} from "@/lib/platform/activity-presets";
import MerchantPaymentsPage from "../../../restaurant/payments/page";

export default async function ActivityPaymentsPage({
 params,searchParams
}:{params:Promise<{activity:string}>;searchParams:Promise<{tenant?:string}>}){
 const {activity}=await params;
 if(!isActivityType(activity))notFound();
 const userId=await currentUserId();if(!userId)redirect("/login");
 const requested=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspace(userId,requested.tenant);}catch{redirect("/account");}
 const actual=await tenantWorkspaceActivity(workspace.tenant_id);
 if(!actual)notFound();
 if(activity!==actual)redirect(activityPaymentsUrl(actual,workspace.tenant_id));
 return <MerchantPaymentsPage searchParams={Promise.resolve({tenant:workspace.tenant_id})} params={Promise.resolve({activity})}/>;
}
