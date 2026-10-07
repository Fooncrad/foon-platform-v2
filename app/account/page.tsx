import Link from "next/link";
import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { database } from "@/lib/db/mysql";

export default async function AccountPage(){
 const id=await currentUserId(); if(!id)redirect("/login");
 const [rows]=await database().execute<RowDataPacket[]>("SELECT email,display_name FROM users WHERE id=? LIMIT 1",[id]); const user=rows[0]; if(!user)redirect("/login");
 const [admins]=await database().execute<RowDataPacket[]>("SELECT role FROM platform_admins WHERE user_id=? AND enabled=TRUE LIMIT 1",[id]);
 const [memberships]=await database().execute<RowDataPacket[]>("SELECT tenant_id,role FROM memberships WHERE user_id=? AND status='active' ORDER BY created_at LIMIT 1",[id]);
 const adminRole=admins[0]?.role; const membership=memberships[0];
 return <main className="auth-shell"><section className="auth-card account-card"><span className="auth-brand">FOON</span><h1>حسابي</h1><p>مرحبًا {String(user.display_name||user.email)}</p><p className="account-email" dir="ltr">{String(user.email)}</p>
 <div className="account-actions">{adminRole&&<Link className="primary-link" href="/admin">دخول لوحة المنصة</Link>}{membership&&<Link className="primary-link" href="/restaurant">دخول لوحة المطعم</Link>}<Link className="secondary-link" href="/">العودة للرئيسية</Link></div>
 <form action="/api/auth/logout" method="post"><button className="secondary-button">تسجيل الخروج</button></form></section></main>;
}
