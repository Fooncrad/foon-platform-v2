import Link from "next/link";
import CustomerProfileEditor from "./profile-editor";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
export default async function CustomerPage(){
 const id=await currentUserId();if(!id)redirect("/login");
 const [rows]=await database().execute<RowDataPacket[]>("SELECT display_name,email,email_verified_at,status FROM users WHERE id=? AND status='active' LIMIT 1",[id]);
 const user=rows[0];if(!user)redirect("/login");
 const [profiles]=await database().execute<RowDataPacket[]>("SELECT phone FROM user_profiles WHERE user_id=? LIMIT 1",[id]);
 const [stores]=await database().execute<RowDataPacket[]>("SELECT t.id,t.name,t.slug FROM tenant_customers c JOIN tenants t ON t.id=c.tenant_id AND t.status='active' WHERE c.user_id=? ORDER BY c.created_at DESC LIMIT 100",[id]);
 const [orders]=await database().execute<RowDataPacket[]>("SELECT o.order_number,o.status,o.payment_status,o.total,o.currency,o.created_at,t.name AS store_name FROM restaurant_orders o JOIN tenants t ON t.id=o.tenant_id WHERE o.customer_user_id=? ORDER BY o.created_at DESC LIMIT 100",[id]);
 const orderLabels:Record<string,string>={new:"جديد",preparing:"قيد التحضير",ready:"جاهز",completed:"مكتمل",cancelled:"ملغي"};
 return <main className="customerDashboard" dir="rtl"><header className="customerHeader"><Link href="/" className="customerBrand">FOON</Link><nav aria-label="روابط الحساب"><Link href="/">استكشاف المتاجر</Link><a href="#account-settings">إعدادات حسابي</a><Link href="/account/library">مكتبة صوري</Link></nav></header><section className="customerWelcome"><span>بوابة العميل</span><h1>مرحبًا {String(user.display_name||"بك")}</h1><p>تابع طلباتك والمتاجر المرتبطة بحسابك.</p></section><section id="account-settings"><CustomerProfileEditor name={String(user.display_name||"")} phone={String(profiles[0]?.phone||"")}/></section><section className="customerOverview">{stores.length>0&&<article><h2>متاجري</h2>{stores.map(store=><p key={String(store.id)}><Link href={`/${String(store.slug)}`}>{String(store.name)}</Link></p>)}</article>}<article><h2>بيانات الحساب</h2><p dir="ltr">{String(user.email)}</p><p>حالة الحساب: {user.status==="active"?"نشط":"قيد المراجعة"}</p><p>البريد الإلكتروني: {user.email_verified_at?"موثق":"غير موثق"}</p></article><article><h2>طلباتي</h2>{orders.length?orders.map(order=><div key={String(order.order_number)}><p><b>#{String(order.order_number)}</b> · {String(order.store_name)}</p><p>{orderLabels[String(order.status)]??String(order.status)} · {Number(order.total).toFixed(2)} {String(order.currency)}</p></div>):<p>لا توجد طلبات مسجّلة لحسابك بعد.</p>}</article><article><h2>حجوزاتي</h2><p>تواصل مع المطعم للاستعلام عن حجزك.</p></article><article><h2>إشعاراتي</h2><p>لا توجد خدمة صندوق إشعارات عملاء مفعلة حاليًا.</p></article></section></main>;
}
