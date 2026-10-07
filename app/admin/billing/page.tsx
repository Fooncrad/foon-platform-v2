const stats=[["بانتظار المراجعة","—"],["مدفوع","—"],["مرفوض","—"],["إجمالي الفواتير","—"]];
const payments=[["تحويل بنكي","رفع إيصال التحويل ومراجعته قبل تفعيل الاشتراك","مفعّل"],["دفع إلكتروني","بوابة الدفع الإلكتروني للترقيات والتجديدات","غير مربوط"]];
export default function BillingPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>المدفوعات والفواتير</h1><p>مركز موحّد لمراجعة المدفوعات وتفعيل الاشتراكات وإدارة الفواتير.</p></div><button className="adminPrimaryButton" type="button">تصدير الفواتير</button></header>
  <section className="adminBillingStats">{stats.map(([label,value])=><article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>طرق الدفع</h2><p>تحكم في القنوات المتاحة للمتاجر عند الاشتراك أو الترقية.</p></div></div><div className="adminPaymentMethods">{payments.map(([name,desc,status])=><article key={name}><div><b>{name}</b><p>{desc}</p></div><span className="adminStatusPill">{status}</span><button type="button">إدارة</button></article>)}</div></section>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>طلبات الدفع</h2><p>مراجعة الإيصالات وحالة العملية قبل اعتماد الاشتراك.</p></div><input aria-label="بحث في المدفوعات" placeholder="رقم العملية أو المتجر..." /></div><div className="adminBillingEmpty"><b>لا توجد عمليات معروضة حاليًا</b><p>ستظهر هنا عمليات الدفع مع المتجر والمبلغ والعملة والوقت وحالة المراجعة.</p></div></section>
 </main>
}