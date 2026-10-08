import Link from "next/link";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
export default async function CustomerPage(){
 const id=await currentUserId();if(!id)redirect("/login");
 const [rows]=await database().execute<RowDataPacket[]>("SELECT display_name,email,email_verified_at,status FROM users WHERE id=? LIMIT 1",[id]);
 const user=rows[0];if(!user)redirect("/login");
 return <main className="customerDashboard" dir="rtl"><header className="customerHeader"><Link href="/" className="customerBrand">FOON</Link><Link href="/account">حسابي</Link></header><section className="customerWelcome"><span>بوابة العميل</span><h1>مرحبًا {String(user.display_name||"بك")}</h1><p>مساحتك الشخصية في FOON. ستظهر الطلبات والحجوزات والإشعارات هنا عند تفعيل خدماتها وربطها بحسابك.</p></section><section className="customerOverview"><article><h2>بيانات الحساب</h2><p dir="ltr">{String(user.email)}</p><p>حالة الحساب: {user.status==="active"?"نشط":"قيد المراجعة"}</p><p>البريد الإلكتروني: {user.email_verified_at?"موثق":"غير موثق"}</p></article><article><h2>طلباتي</h2><p>لم تُربط خدمة طلبات العملاء بعد. لن تُعرض طلبات غير مؤكدة أو بيانات متاجر أخرى.</p></article><article><h2>حجوزاتي</h2><p>ستظهر الحجوزات الخاصة بحسابك بعد تشغيل خدمة الحجز وربطها بالعميل.</p></article><article><h2>إشعاراتي</h2><p>لا توجد خدمة صندوق إشعارات عملاء مفعلة حاليًا.</p></article></section></main>;
}
