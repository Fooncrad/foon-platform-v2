const plans=[
 ["مجانية","0","للبداية والتجربة","نشطة"],
 ["أساسية","—","للمتاجر الصغيرة","قيد الإعداد"],
 ["احترافية","—","للتشغيل المتقدم","قيد الإعداد"],
 ["أعمال","—","للفروع والفرق الكبيرة","قيد الإعداد"]
];
export default function PlansPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الباقات والاشتراكات</h1><p>إدارة خطط المنصة والأسعار ودورات الفوترة والمزايا من مكان واحد.</p></div><button className="adminPrimaryButton" type="button">إضافة باقة</button></header>
  <section className="adminPlanGrid">{plans.map(([name,price,desc,status])=><article className="adminPlanCard" key={name}><div className="adminPlanCardHead"><div><b>{name}</b><p>{desc}</p></div><span className="adminStatusPill">{status}</span></div><div className="adminPlanPrice"><strong>{price}</strong><span>ر.س / شهريًا</span></div><div className="adminPlanMeta"><span>شهري / سنوي</span><span>عملات متعددة</span><span>مزايا قابلة للتحكم</span></div><div className="adminRowActions"><button type="button">تحرير</button><button type="button">المزايا</button><button type="button">الأسعار</button></div></article>)}</section>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>إدارة الاشتراكات</h2><p>متابعة الاشتراكات النشطة والترقيات والتجديدات والحالات المعلقة.</p></div></div><div className="adminSubscriptionStats"><article><b>النشطة</b><strong>—</strong></article><article><b>بانتظار الدفع</b><strong>—</strong></article><article><b>تنتهي قريبًا</b><strong>—</strong></article><article><b>الموقوفة</b><strong>—</strong></article></div></section>
 </main>
}