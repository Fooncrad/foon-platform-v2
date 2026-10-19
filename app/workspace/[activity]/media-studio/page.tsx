import {notFound,redirect} from "next/navigation";
import {currentUserId} from "@/lib/auth/session";
import {resolveWorkspaceForActivity} from "@/lib/tenant/workspace";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {activityMediaStudioUrl} from "@/lib/tenant/workspace-routes";
import {isActivityType} from "@/lib/platform/activity-presets";
import MediaStudioPage from "../../../restaurant/media-studio/page";

export default async function ActivityMediaStudioPage({
 params,searchParams
}:{params:Promise<{activity:string}>;searchParams:Promise<{tenant?:string}>}){
 const {activity}=await params;
 if(!isActivityType(activity))notFound();
 const userId=await currentUserId();if(!userId)redirect("/login");
 const requested=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspaceForActivity(userId,activity,requested.tenant);}catch{redirect("/account");}
 const actual=await tenantWorkspaceActivity(workspace.tenant_id);
 if(!actual)notFound();
 if(activity!==actual)redirect(activityMediaStudioUrl(actual,workspace.tenant_id));
 return <MediaStudioPage searchParams={Promise.resolve({tenant:workspace.tenant_id})} params={Promise.resolve({activity})}/>;
}
