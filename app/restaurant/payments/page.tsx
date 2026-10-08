import {resolveWorkspace} from "@/lib/tenant/workspace";
import PaymentEditor from "./payment-editor";
import Link from "next/link";
import {redirect} from "next/navigation";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
export default async function MerchantPaymentsPage({searchParams}:{searchParams:Promise<{tenant?:string}>}){
 const user=await currentUserId();if(!user)redirect("/login");
 const {tenant}=await searchParams;
 let workspace;try{workspace=await resolveWorkspace(user,tenant);if(!["owner","manager","accountant"].includes(String(workspace.role)))throw Error();}catch{redirect("/account");}
 const tenantId=String(workspace.tenant_id);
 const [branches]=await database().execute<RowDataPacket[]>("SELECT id,name FROM branches WHERE tenant_id=? AND enabled=TRUE ORDER BY name",[tenantId]);
 return <main className="workspace" dir="rtl"><header className="workspace-head"><div><h1>بوابة دفع المنشأة</h1><p>{String(workspace.name)} · إعدادات دفع مستقلة عن اشتراكات FOON وعن المنشآت الأخرى.</p></div><Link href={"/restaurant?tenant="+encodeURIComponent(tenantId)}>العودة للوحة المنشأة</Link></header><section className="adminPanel"><h2>إعداد مزود الدفع</h2><p>تخزين إعدادات مزود الدفع معزول على مستوى المنشأة والفرع، وتعديله مقصور على المالك والمدير. يمكن للمحاسب الاطلاع فقط.</p><p>لم يُفعّل الدفع الإلكتروني بعد. لن نطلب مفاتيح سرية حتى تتوفر خزنة أسرار مشفرة وتوقيعات Webhook موثوقة.</p></section><PaymentEditor tenantId={tenantId} canEdit={workspace.role!=="accountant"} branches={branches.map(b=>({id:String(b.id),name:String(b.name)}))}/></main>;
}
