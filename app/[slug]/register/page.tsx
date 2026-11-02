import {notFound} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import CustomerForm from "./customer-form";
import {tenantPublicControls} from "@/lib/tenant/public-controls";
import Link from "next/link";
export default async function StoreCustomerRegistration({params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 const [rows]=await database().execute<RowDataPacket[]>("SELECT id,name,slug FROM tenants WHERE slug=? AND status='active' LIMIT 1",[slug]);
 if(!rows.length)notFound();
 if(!(await tenantPublicControls(String(rows[0].id))).customerLogin)return <main className="auth-shell"><section className="auth-card"><h1>تسجيل العملاء متوقف مؤقتًا</h1><p>تم إيقاف تسجيل الحسابات لهذا المتجر.</p><Link href={"/"+encodeURIComponent(slug)}>العودة إلى المتجر</Link></section></main>;
 return <CustomerForm slug={String(rows[0].slug)} name={String(rows[0].name)}/>;
}
