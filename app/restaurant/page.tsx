import {defaultActivityModules,isActivityType} from "@/lib/platform/activity-presets";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {branchVersion} from "@/lib/restaurant/branch-version";
import MerchantDashboard,{type MerchantData} from "./merchant-dashboard";
import "./merchant-dashboard.css";
import "./merchant-operations.css";

export default async function RestaurantPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;try{workspace=await resolveWorkspace(userId,tenant);}catch{redirect("/account");}
 const tenantId=workspace.tenant_id,canManage=["owner","manager"].includes(workspace.role);
 const db=database();
 const [activityRows]=await db.execute<RowDataPacket[]>("SELECT activity_code,currency FROM tenant_business_profiles WHERE tenant_id=? LIMIT 1",[tenantId]);
 // Legacy restaurant tenants may not yet have a business profile. Restore their
 // restaurant navigation without overriding an explicitly configured activity.
 const storedActivityCode=String(activityRows[0]?.activity_code??"").trim();
 // This is the restaurant workspace: an absent or legacy unknown activity code
 // must not hide restaurant tools. Explicitly supported other activities retain
 // their own module presets; RBAC and subscription checks remain unchanged.
 const activityCode=isActivityType(storedActivityCode)?storedActivityCode:"restaurant";
 const activityModules=[...defaultActivityModules(activityCode)];
 const [[branches],[subscriptions],[features],[tenants],[choices]]=await Promise.all([
  db.execute<RowDataPacket[]>("SELECT id,name,slug,enabled FROM branches WHERE tenant_id=? ORDER BY created_at",[tenantId]),
  db.execute<RowDataPacket[]>("SELECT p.name_ar AS plan_name,CASE WHEN s.status<>'active' THEN s.status WHEN s.ends_at IS NOT NULL AND s.ends_at<=NOW() THEN 'expired' WHEN p.enabled=FALSE OR (s.starts_at IS NOT NULL AND s.starts_at>NOW()) THEN 'pending' ELSE 'active' END AS status,s.starts_at,s.ends_at,p.enabled FROM tenant_subscriptions s JOIN package_plans p ON p.id=s.plan_id WHERE s.tenant_id=? LIMIT 1",[tenantId]),
  db.execute<RowDataPacket[]>("SELECT f.feature_key,f.name_ar,pf.enabled,pf.limit_value FROM package_features f LEFT JOIN tenant_subscriptions s ON s.tenant_id=? AND s.status='active' AND (s.starts_at IS NULL OR s.starts_at<=NOW()) AND (s.ends_at IS NULL OR s.ends_at>NOW()) LEFT JOIN package_plans p ON p.id=s.plan_id AND p.enabled=TRUE LEFT JOIN package_plan_features pf ON pf.plan_id=p.id AND pf.feature_key=f.feature_key ORDER BY f.category,f.feature_key",[tenantId]),
  db.execute<RowDataPacket[]>("SELECT slug FROM tenants WHERE id=? LIMIT 1",[tenantId]),
  db.execute<RowDataPacket[]>("SELECT t.id,t.name FROM memberships m JOIN tenants t ON t.id=m.tenant_id AND t.status='active' JOIN users u ON u.id=m.user_id AND u.status='active' WHERE m.user_id=? AND m.status='active' ORDER BY m.created_at",[userId])
 ]);
 let customerCount:number|null=null;
 if(canManage){const [rows]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM tenant_customers WHERE tenant_id=?",[tenantId]);customerCount=Number(rows[0]?.total??0);}
 const staffPermissions:string[]=[];
 let assignedBranchIds:Set<string>|null=null;
 if(!canManage){
  const [grants]=await db.execute<RowDataPacket[]>("SELECT permission_key,branch_id FROM employee_permission_grants WHERE tenant_id=? AND user_id=? AND allowed=TRUE",[tenantId,userId]);
  const [assignments]=await db.execute<RowDataPacket[]>("SELECT branch_id FROM employee_branch_assignments WHERE tenant_id=? AND user_id=? AND enabled=TRUE",[tenantId,userId]);
  const assigned=new Set(assignments.map(row=>String(row.branch_id)));
  assignedBranchIds=assigned;
  for(const grant of grants)if(grant.branch_id==null||assigned.has(String(grant.branch_id)))staffPermissions.push(String(grant.permission_key));
 }
 const subscription=subscriptions[0];
 const now=new Date();
 const data:MerchantData={
  tenantId,activityCode,currency:String(activityRows[0]?.currency??"SAR"),activityModules,name:workspace.name,slug:String(tenants[0].slug),role:workspace.role,adminAccess:workspace.adminAccess,
  staffPermissions,tenantChoices:choices.map(t=>({id:String(t.id),name:String(t.name)})),
  date:new Intl.DateTimeFormat("ar-SA",{dateStyle:"full",timeZone:"Asia/Riyadh"}).format(new Date()),
  reportDay:new Date(now.getTime()+3*3600000).toISOString().slice(0,10),
  branches:branches.filter(b=>canManage||assignedBranchIds?.has(String(b.id))).map(b=>({id:String(b.id),name:String(b.name),slug:String(b.slug),enabled:Boolean(b.enabled),version:branchVersion({name:b.name,slug:b.slug,enabled:b.enabled})})),
  features:features.map(f=>({key:String(f.feature_key),name:String(f.name_ar),enabled:Boolean(f.enabled),limit:f.limit_value==null?null:Number(f.limit_value)})),
  subscription:subscription?{name:String(subscription.plan_name),status:String(subscription.status),endsAt:subscription.ends_at?new Date(subscription.ends_at).toISOString().slice(0,10):null}:null,
  customerCount
 };
 return <MerchantDashboard key={tenantId} data={data}/>;
}
