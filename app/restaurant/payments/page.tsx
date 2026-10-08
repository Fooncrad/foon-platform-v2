import Link from "next/link";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
export default async function MerchantPaymentsPage(){
 const user=await currentUserId();if(!user)redirect("/login");
 const [rows]=await database().execute<RowDataPacket[]>("SELECT t.name,m.role FROM memberships m JOIN tenants t ON t.id=m.tenant_id JOIN users u ON u.id=m.user_id WHERE m.user_id=? AND m.status='active' AND t.status='active' AND u.status='active' AND m.role IN ('owner','manager','accountant') ORDER BY m.created_at LIMIT 1",[user]);
 if(!rows.length)redirect("/account");
 return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>بوابة دفع المنشأة</h1><p>{String(rows[0].name)} · إعدادات دفع مستقلة عن اشتراكات FOON وعن المنشآت الأخرى.</p></div><Link href="/restaurant">العودة للوحة المنشأة</Link></header><section className="adminPanel"><h2>إعداد مزود الدفع</h2><p>تخزين إعدادات مزود الدفع معزول على مستوى المنشأة والفرع، وتعديله مقصور على المالك والمدير. يمكن للمحاسب الاطلاع فقط.</p><p>لم يُفعّل الدفع الإلكتروني بعد. لن نطلب مفاتيح سرية حتى تتوفر خزنة أسرار مشفرة وتوقيعات Webhook موثوقة.</p></section></main>;
}
