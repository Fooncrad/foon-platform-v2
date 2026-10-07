const channels=[
 ["داخل المنصة","تنبيهات مباشرة للأدمن والمتاجر","مفعّل"],
 ["البريد الإلكتروني","رسائل الطلبات والحسابات والفواتير","جاهز للإعداد"],
 ["الصوت","تنبيه صوتي للأحداث المهمة","مفعّل"]
];
const events=["طلب جديد","حجز جديد","نداء نادل","دفعة جديدة","ترقية باقة","تنبيه تقني"];
export default function NotificationsPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الإشعارات والرسائل</h1><p>مركز موحّد للتحكم في قنوات التنبيه والأحداث وقوالب الرسائل.</p></div><button className="adminPrimaryButton" type="button">إضافة قالب</button></header>
  <section className="adminNotificationStats"><article><span>القنوات المفعّلة</span><strong>2</strong></article><article><span>القوالب</span><strong>—</strong></article><article><span>فشل الإرسال</span><strong>—</strong></article></section>
  <section className="workspace-grid">
   {channels.map(([name,desc,status])=><article className="adminToolCard" key={name}><div><b>{name}</b><p>{desc}</p></div><span>{status}</span></article>)}
  </section>
  <section className="adminPanel adminNotificationEvents">
   <div className="adminPanelHead"><div><h2>الأحداث</h2><p>حدد القنوات المستخدمة لكل حدث مع إمكانية إدارة القالب الخاص به.</p></div></div>
   <div className="adminEventGrid">{events.map(event=><div className="adminEventRow" key={event}><div><b>{event}</b><small>حدث تشغيلي</small></div><div className="adminChannelBadges"><span>داخل المنصة</span><span>البريد</span><span>الصوت</span></div><button type="button">إدارة</button></div>)}</div>
  </section>
 </main>
}