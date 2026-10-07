import Link from "next/link";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {requirePlatformRole} from "@/lib/auth/authorization";
import {database} from "@/lib/db/mysql";

export default async function AdminPage(){
 const id=await currentUserId();if(!id)redirect("/login");try{await requirePlatformRole(id,["super_admin","admin","support"]);}catch{redirect("/account");}
 const [rows]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) total,SUM(status='active') active,SUM(status='pending') pending,SUM(status='suspended') suspended FROM tenants");
 const s=rows[0]??{};
 return <main className="workspace"><header className="workspace-head"><div><h1>نظرة عامة</h1><p>ملخص تشغيل المنصة من مكان واحد.</p></div><Link href="/admin/tenants">إدارة المتاجر</Link></header>
 <section className="workspace-grid">
  <Link className="workspace-card" href="/admin/tenants"><strong>{Number(s.total??0)}</strong><span>إجمالي المتاجر</span></Link>
  <article><strong>{Number(s.active??0)}</strong><span>متاجر نشطة</span></article>
  <article><strong>{Number(s.pending??0)}</strong><span>قيد المراجعة</span></article>
  <article><strong>{Number(s.suspended??0)}</strong><span>متاجر موقوفة</span></article>
 </section></main>;
}