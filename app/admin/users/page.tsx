import {cookies as uiCookies} from "next/headers";
import {uiText} from "@/lib/i18n/ui-copy";
import UserActions from "./user-actions";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";

type Account = RowDataPacket & {
 id:string; email:string; display_name:string|null; status:string;
 platform_role:string|null; tenant_count:number; created_at:Date;
};

export default async function UsersPage({searchParams}:{searchParams:Promise<{q?:string;status?:string}>}){
 const translationLanguage=(await uiCookies()).get("foon_language")?.value;
 const translateUi=(value:string)=>uiText(value,translationLanguage==="en"||translationLanguage==="fr"?translationLanguage:"ar");

 const params=await searchParams;
 const q=String(params.q??"").trim().slice(0,100);
 const status=["active","pending","suspended"].includes(params.status??"")?params.status!:"";
 const filters:string[]=[];const args:string[]=[];
 if(q){filters.push("(u.email LIKE ? OR u.display_name LIKE ?)");args.push("%"+q+"%","%"+q+"%");}
 if(status){filters.push("u.status=?");args.push(status);}
 const where=filters.length?" WHERE "+filters.join(" AND "):"";
 const userId=await currentActiveAdminUserId();
 if(!userId)redirect("/login");
 let canManage=false;
 try{const role=await requirePlatformRole(userId,["super_admin","admin","support"]);canManage=role.role==="super_admin";}
 catch{redirect("/account");}
 const [users]=await database().execute<Account[]>(
  "SELECT u.id,u.email,u.display_name,u.status,u.created_at,IF(pa.enabled=TRUE,pa.role,NULL) AS platform_role,(SELECT COUNT(*) FROM memberships m WHERE m.user_id=u.id AND m.status='active') AS tenant_count FROM users u LEFT JOIN platform_admins pa ON pa.user_id=u.id"+where+" ORDER BY u.created_at DESC LIMIT 200",args
 );
 const admins=users.filter(u=>u.platform_role==="super_admin"||u.platform_role==="admin").length;
 const support=users.filter(u=>u.platform_role==="support").length;
 const storeAccounts=users.filter(u=>Number(u.tenant_count)>0).length;
 return <main className="workspace">
  <header className="workspace-head"><div><h1>{translateUi("المستخدمون والصلاحيات")}</h1><p>{translateUi("آخر 200 حساب فعلي، مع الفصل بين أدوار المنصة وعضويات المتاجر.")}</p></div></header>
  <section className="adminPanel"><form action="/admin/users" method="get" className="adminUserFilters"><label>{translateUi("بحث الحساب")}<input type="search" name="q" defaultValue={q} placeholder="البريد أو اسم المستخدم" maxLength={100}/></label><label>{translateUi("الحالة")}<select name="status" defaultValue={status}><option value="">{translateUi("جميع الحالات")}</option><option value="active">{translateUi("نشط")}</option><option value="pending">{translateUi("قيد الانتظار")}</option><option value="suspended">{translateUi("موقوف")}</option></select></label><button type="submit">{translateUi("بحث")}</button><Link href="/admin/users">{translateUi("إعادة تعيين")}</Link></form><p>{translateUi("النتائج المعروضة:")} {users.length}  {translateUi("حساب (بحد أقصى 200 نتيجة).")}</p></section>
  <section className="adminAccessStats"><article><span>{translateUi("مديرو المنصة المعروضون")}</span><strong>{admins}</strong></article><article><span>{translateUi("الدعم المعروض")}</span><strong>{support}</strong></article><article><span>{translateUi("حسابات المتاجر المعروضة")}</span><strong>{storeAccounts}</strong></article></section>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>{translateUi("الحسابات")}</h2><p>{translateUi("إيقاف الحسابات وإعادة تفعيلها متاحان للمشرف الأعلى فقط، مع سجل تدقيق وإلغاء الجلسات عند الإيقاف. تغيير دور المنصة متاح للمشرف الأعلى فقط؛ لا تتغير عضويات المتاجر.")}</p></div></div>
   {users.length===0?<div className="adminUsersEmpty"><b>{translateUi("لا توجد حسابات")}</b></div>:
    <div className="adminDataTableWrap"><table className="adminDataTable">
     <thead><tr><th scope="col">{translateUi("الحساب")}</th><th scope="col">{translateUi("الحالة")}</th><th scope="col">{translateUi("دور المنصة")}</th><th scope="col">{translateUi("عضويات المتاجر")}</th>{canManage&&<th scope="col">{translateUi("إجراءات")}</th>}</tr></thead>
     <tbody>{users.map(user=><tr key={user.id}><td><b>{user.display_name??"—"}</b><div dir="ltr">{user.email}</div></td><td>{user.status}</td><td>{user.platform_role??"—"}</td><td>{Number(user.tenant_count)}</td>{canManage&&<td>{user.id!==userId&&user.platform_role!=="super_admin"?<UserActions userId={user.id} status={user.status} platformRole={user.platform_role}/>:<span>{translateUi("محمي")}</span>}</td>}</tr>)}</tbody>
    </table></div>}
  </section>
 </main>;
}
