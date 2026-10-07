import { redirect } from "next/navigation";
import type { RowDataPacket } from "mysql2/promise";
import { currentUserId } from "@/lib/auth/session";
import { database } from "@/lib/db/mysql";

export default async function RestaurantPage(){
 const id=await currentUserId(); if(!id)redirect("/login");
 const [rows]=await database().execute<RowDataPacket[]>("SELECT m.tenant_id,m.role,t.name FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=? AND m.status='active' AND t.status='active' ORDER BY m.created_at LIMIT 1",[id]);
 const membership=rows[0]; if(!membership)redirect("/account");
 return <main className="workspace"><header className="workspace-head"><div><span className="auth-brand">FOON</span><h1>{String(membership.name)}</h1><p>مساحة تشغيل المطعم · {String(membership.role)}</p></div></header>
 <section className="workspace-grid"><article><strong>الطلبات</strong><span>إدارة الطلبات المباشرة</span></article><article><strong>المنيو</strong><span>الأقسام والأصناف والأسعار</span></article><article><strong>الحجوزات والطاولات</strong><span>الحجوزات والانتظار وخدمة الطاولات</span></article></section></main>;
}
