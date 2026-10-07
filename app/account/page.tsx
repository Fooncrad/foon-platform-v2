import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { database } from "@/lib/db/mysql";

export default async function AccountPage(){
 const id=await currentUserId(); if(!id)redirect("/login");
 const [rows]=await database().execute<RowDataPacket[]>("SELECT email,display_name FROM users WHERE id=? LIMIT 1",[id]); const user=rows[0]; if(!user)redirect("/login");
 return <main className="auth-shell"><section className="auth-card"><span className="auth-brand">FOON</span><h1>حسابي</h1><p>مرحبًا {String(user.display_name||user.email)}</p><p className="account-email" dir="ltr">{String(user.email)}</p><form action="/api/auth/logout" method="post"><button className="secondary-button">تسجيل الخروج</button></form></section></main>;
}
