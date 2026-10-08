export default function NotificationsPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>الإشعارات والرسائل</h1><p>قنوات التنبيه والأحداث وقوالب الرسائل.</p></div></header>
  <section className="adminPanel"><div className="adminPanelHead"><div><h2>حالة النظام</h2><p>لم يُربط هذا القسم بعد بإعدادات القنوات أو سجل إرسال الرسائل الفعلي.</p></div></div>
   <div className="adminUsersEmpty" role="status"><b>إدارة الإشعارات غير مفعّلة</b><p>لا يمكن تأكيد تشغيل البريد أو الصوت أو إشعارات المتاجر دون إعداد القنوات واختبار التسليم الفعلي. لا تُعرض أعداد أو حالات تشغيل افتراضية.</p></div>
  </section>
 </main>;
}
