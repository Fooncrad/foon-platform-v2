import {redirect} from "next/navigation";
import Link from "next/link";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";

export default async function AccountPage(){
 const id=await currentUserId();
 if(!id)redirect("/login");
 const [admins]=await database().execute<RowDataPacket[]>("SELECT pa.role FROM platform_admins pa JOIN users u ON u.id=pa.user_id WHERE pa.user_id=? AND pa.enabled=TRUE AND u.status='active' LIMIT 1",[id]);
 if(admins.length)redirect("/admin");
 const [memberships]=await database().execute<RowDataPacket[]>("SELECT m.tenant_id FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='active' AND t.status='active' AND u.status='active' ORDER BY m.created_at LIMIT 1",[id]);
 if(memberships.length)redirect("/restaurant");
 redirect("/customer");
 return <main className="auth-shell" dir="rtl"><section className="auth-card">
  <Link href="/" className="auth-brand">FOON</Link>
  <h1>مرحبًا بك في FOON</h1><p>حسابك جاهز. يمكنك تسجيل مطعم أو متجر جديد والانتقال إلى لوحة الإدارة الخاصة به.</p>
  <p><Link href="/restaurant/register">تسجيل مطعم أو متجر</Link></p>
  <p className="auth-switch"><Link href="/">العودة إلى الرئيسية</Link></p>
 </section></main>;
}
