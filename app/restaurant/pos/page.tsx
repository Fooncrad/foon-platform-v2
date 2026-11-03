import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import {resolveWorkspace} from "@/lib/tenant/workspace";
import {tenantWorkspaceActivity} from "@/lib/tenant/workspace-activity";
import {defaultActivityModules} from "@/lib/platform/activity-presets";
import {staffBranchPermissions,type StaffGrant} from "@/lib/restaurant/staff-grants";
import CashierPosClient from "./cashier-pos-client";
import "./cashier-pos.css";

export default async function CashierPosPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const userId=await currentUserId();
 if(!userId)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;
 try{workspace=await resolveWorkspace(userId,tenant);}catch{redirect("/account");}
 if(workspace.role!=="cashier"||workspace.adminAccess)redirect("/account");
 const activity=await tenantWorkspaceActivity(workspace.tenant_id);
 if(!activity)redirect("/account");
 const [branchRows]=await database().execute<RowDataPacket[]>(
  "SELECT b.id,b.name FROM employee_branch_assignments a JOIN branches b ON BINARY b.id=BINARY a.branch_id AND BINARY b.tenant_id=BINARY a.tenant_id WHERE BINARY a.tenant_id=BINARY ? AND BINARY a.user_id=BINARY ? AND a.enabled=TRUE AND a.role=? AND b.enabled=TRUE ORDER BY b.created_at",
  [workspace.tenant_id,userId,workspace.role]
 );
 const [grantRows]=await database().execute<RowDataPacket[]>(
  "SELECT permission_key,branch_id,allowed FROM employee_permission_grants WHERE BINARY tenant_id=BINARY ? AND BINARY user_id=BINARY ?",
  [workspace.tenant_id,userId]
 );
 const grants:StaffGrant[]=grantRows.map(row=>({permission_key:String(row.permission_key),branch_id:row.branch_id==null?null:String(row.branch_id),allowed:Number(row.allowed)}));
 const branches=branchRows.map(row=>({id:String(row.id),name:String(row.name)})).filter(item=>{
  const permissions=staffBranchPermissions(grants,item.id);
  return permissions.includes("pos.view")&&permissions.includes("pos.create");
 });
 if(!branches.length)return <main className="foonCashierPage" dir="rtl"><section className="foonCashierAccess"><span>FOON POS</span><h1>لا يوجد فرع مخصص لنقاط البيع</h1><p>لم يتم تعيين فرع نشط وصلاحية عرض وإنشاء الطلبات لحسابك. اطلب من مدير المنشأة تعيين فرعك وصلاحيات نقطة البيع.</p></section></main>;
 const modules=defaultActivityModules(activity);
 return <main className="foonCashierPage" dir="auto" data-activity={activity}>
  <header className="foonCashierHeader"><div className="foonCashierBrand"><span className="foonCashierMark">F</span><div><strong>FOON POS</strong><small>نقطة البيع · الكاشير</small></div></div><div className="foonCashierBranch"><small>فرع العمل</small><strong>{branches[0].name}</strong></div></header>
  <CashierPosClient tenantId={workspace.tenant_id} branch={branches[0].id} branches={branches} dining={modules.includes("tables")}/>
 </main>;
}
