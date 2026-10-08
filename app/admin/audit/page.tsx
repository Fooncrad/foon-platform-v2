import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { currentActiveAdminUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";
import { database } from "@/lib/db/mysql";

type AuditEvent = RowDataPacket & {
 id: number; actor_email: string; action: string;
 target_type: string | null; target_id: string | null; created_at: Date;
};

export default async function AuditPage({searchParams}:{searchParams:Promise<{q?:string;action?:string}>}){
 const params=await searchParams;
 const q=String(params.q??"").trim().slice(0,100);
 const action=String(params.action??"").trim().slice(0,80);
 const filters:string[]=[];const values:string[]=[];
 if(q){filters.push("(u.email LIKE ? OR e.target_id LIKE ?)");values.push("%"+q+"%","%"+q+"%");}
 if(action){filters.push("e.action LIKE ?");values.push("%"+action+"%");}
 const where=filters.length?" WHERE "+filters.join(" AND "):"";
 const userId=await currentActiveAdminUserId();
 if(!userId)redirect("/login");
 try{await requirePlatformRole(userId,["super_admin","admin","support"]);}
 catch{redirect("/account");}
 const [events]=await database().execute<AuditEvent[]>(
  "SELECT e.id,u.email AS actor_email,e.action,e.target_type,e.target_id,e.created_at FROM platform_audit_events e INNER JOIN users u ON u.id=e.actor_user_id "+where+" ORDER BY e.created_at DESC,e.id DESC LIMIT 100",values
 );
 return <main className="workspace">
  <header className="workspace-head"><div><h1>سجل العمليات</h1><p>آخر 100 عملية إدارية مسجلة فعليًا، الأحدث أولًا.</p></div></header>
  <section className="adminPanel"><form action="/admin/audit" className="adminUserFilters"><label>البريد أو معرف الهدف<input name="q" defaultValue={q} maxLength={100}/></label><label>نوع العملية<input name="action" defaultValue={action} maxLength={80} placeholder="tenant.status"/></label><button type="submit">تصفية</button><Link href="/admin/audit">إعادة تعيين</Link></form><p>عرض {events.length} عملية بحد أقصى 100.</p></section>
  <section className="adminPanel">
   <div className="adminPanelHead"><div><h2>آخر العمليات</h2><p>الوقت والتصرف والحساب المنفذ والجهة المتأثرة.</p></div></div>
   {events.length===0?<div className="adminAuditEmpty" role="status"><b>لا توجد عمليات مسجلة بعد</b></div>:
    <div style={{overflowX:"auto"}}>
     <table style={{width:"100%",textAlign:"start",borderCollapse:"collapse"}}>
      <thead><tr><th scope="col">الوقت</th><th scope="col">العملية</th><th scope="col">المنفذ</th><th scope="col">الهدف</th></tr></thead>
      <tbody>{events.map(event=><tr key={event.id}>
       <td><time dateTime={new Date(event.created_at).toISOString()}>{new Date(event.created_at).toLocaleString("en-GB",{timeZone:"UTC"})} UTC</time></td>
       <td>{event.action}</td><td dir="ltr">{event.actor_email}</td>
       <td>{event.target_type??"—"} {event.target_id??""}</td>
      </tr>)}</tbody>
     </table>
    </div>}
  </section>
 </main>;
}
