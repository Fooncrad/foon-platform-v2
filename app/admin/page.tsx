import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUserId } from "@/lib/auth/session";
import { requirePlatformRole } from "@/lib/auth/authorization";

export default async function AdminPage(){
 const id=await currentUserId();if(!id)redirect("/login");try{await requirePlatformRole(id,["super_admin","admin","support"]);}catch{redirect("/account");}
 return <main className="workspace"><header className="workspace-head"><div><span className="auth-brand">FOON</span><h1>لوحة المنصة</h1><p>إدارة المنصة والمتاجر والصلاحيات من مساحة مستقلة.</p></div><Link href="/account">حسابي</Link></header>
 <section className="workspace-grid"><Link className="workspace-card" href="/admin/tenants"><strong>المتاجر</strong><span>إنشاء المطاعم والمتاجر وإدارة حالتها</span></Link><article><strong>الاشتراكات</strong><span>الخطط والفوترة — قريبًا</span></article><article><strong>الأمان</strong><span>الصلاحيات وسجل العمليات</span></article></section></main>;
}
