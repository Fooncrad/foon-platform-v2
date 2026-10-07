const channels=[
 ["داخل المنصة","تنبيهات مباشرة للأدمن والمتاجر","مفعّل"],
 ["البريد الإلكتروني","رسائل الطلبات والحسابات والفواتير","جاهز للإعداد"],
 ["الصوت","تنبيه صوتي للأحداث المهمة","مفعّل"]
];
const events=["طلب جديد","حجز جديد","نداء نادل","دفعة جديدة","ترقية باقة","تنبيه تقني"];
export default function NotificationsPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الإشعارات والرسائل</h1><p>مركز موحّد للتحكم في قنوات التنبيه والأحداث وقوالب الرسائل.</p></div><button className="adminPrimaryButton" type="button">إضافة قالب</button></header>
  <section className="workspace-grid">
   {channels.map(([name,desc,status])=><article className="adminToolCard" key={name}><div><b>{name}</b><p>{desc}</p></div><span>{status}</span></article>)}
  </section>
  <section className="adminPanel">
   <div className="adminPanelHead"><div><h2>الأحداث</h2><p>الأحداث التي يمكن ربطها بقنوات الإشعار.</p></div></div>
   <div className="adminEventGrid">{events.map(event=><div className="adminEventRow" key={event}><b>{event}</b><span>داخل المنصة · البريد · الصوت</span><button type="button">إدارة</button></div>)}</div>
  </section>
 </main>
}