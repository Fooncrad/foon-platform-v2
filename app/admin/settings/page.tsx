const sections=[
 ["هوية المنصة","اسم المنصة والشعار والأيقونة وبيانات الظهور العامة.",["اسم المنصة","وصف مختصر","البريد العام"]],
 ["الإعدادات الإقليمية","اللغة الافتراضية والدولة والعملة والمنطقة الزمنية.",["اللغة الافتراضية","الدولة الافتراضية","العملة الافتراضية"]],
 ["التشغيل","قواعد إنشاء المتاجر وحالة السوق والإعدادات الافتراضية.",["إنشاء المتاجر","ظهور السوق","الوضع الافتراضي"]],
 ["الدعم والتواصل","بيانات الدعم التي تظهر للمستخدمين والمتاجر.",["بريد الدعم","رقم التواصل","رابط مركز المساعدة"]]
];
export default function SettingsPage(){
 return <main className="workspace">
  <header className="workspace-head"><div><h1>إعدادات المنصة</h1><p>إعدادات FOON العامة مرتبة في مجموعات مستقلة لتجنب الحفظ الخاطئ بين الأقسام.</p></div></header>
  <div className="adminSettingsGrid">
   {sections.map(([title,desc,fields])=><section className="adminPanel" key={title as string}>
    <div className="adminPanelHead"><div><h2>{title as string}</h2><p>{desc as string}</p></div><span className="adminStatusPill">إعداد مستقل</span></div>
    <div className="adminSettingsFields">{(fields as string[]).map(field=><label key={field}><span>{field}</span><input placeholder={field}/></label>)}</div>
    <div className="adminPanelActions"><small>أي تغيير في هذا القسم يُحفظ بمعزل عن بقية الإعدادات.</small><button className="adminPrimaryButton" type="button">حفظ القسم</button></div>
   </section>)}
  </div>
 </main>
}