import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import CustomerLoginForm from "./customer-login-form";
import {tenantPublicControls} from "@/lib/tenant/public-controls";
import Link from "next/link";
export default async function StoreCustomerLogin({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,slug FROM tenants WHERE slug=? AND status='active' LIMIT 1",[slug]);
 if(!rows.length)notFound();
 if(!(await tenantPublicControls(String(rows[0].id))).customerLogin)return <main className="auth-shell"><section className="auth-card"><h1>دخول العملاء متوقف مؤقتًا</h1><p>تم إيقاف تسجيل دخول العملاء لهذا المتجر.</p><Link href={"/"+encodeURIComponent(slug)}>العودة إلى المتجر</Link></section></main>;
 return <CustomerLoginForm slug={String(rows[0].slug)} name={String(rows[0].name)}/>;
}
