export type PlanNoticeLocale = "ar" | "en" | "fr";
type NoticeCopy = readonly [string,string,string];

const notices:Record<string,NoticeCopy>={
 PLAN_FEATURE_REQUIRED:[
  "هذه الميزة غير مفعّلة ضمن باقة المنشأة الحالية. راجع الباقة أو تواصل مع مالك النشاط أو المدير.",
  "This feature is not enabled by the current business plan. Review the plan or contact the business owner or manager.",
  "Cette fonctionnalité n’est pas activée dans l’offre actuelle. Vérifiez l’offre ou contactez le propriétaire ou le responsable."
 ],
 PLAN_LIMIT_REACHED:[
  "تم بلوغ الحد المسموح لهذه الميزة في الباقة الحالية. راجع السجلات الحالية أو اطلب ترقية الباقة من مالك النشاط.",
  "The current plan limit for this feature has been reached. Review existing records or ask the business owner to upgrade the plan.",
  "La limite de cette fonctionnalité est atteinte pour l’offre actuelle. Vérifiez les éléments existants ou demandez au propriétaire de changer d’offre."
 ],
 ACTIVITY_MODULE_UNAVAILABLE:[
  "هذه الأداة غير متاحة لنوع النشاط المسجّل. اختر الأداة المخصصة لهذا النشاط.",
  "This tool is not available for the registered business activity. Use the tool designed for this activity.",
  "Cet outil n’est pas disponible pour l’activité enregistrée. Utilisez l’outil prévu pour cette activité."
 ],
 NO_ACTIVE_SUBSCRIPTION:[
  "لا يوجد اشتراك نشط حاليًا. راجع حالة الاشتراك مع مالك النشاط.",
  "There is no active subscription. Check the subscription status with the business owner.",
  "Aucun abonnement actif. Vérifiez son statut avec le propriétaire de l’activité."
 ],
 SUBSCRIPTION_PENDING:[
  "الاشتراك بانتظار التفعيل أو المراجعة. لا تكرر طلب الدفع؛ تحقق من حالة الطلب أولًا.",
  "The subscription is awaiting activation or review. Do not repeat a payment; check the request status first.",
  "L’abonnement est en attente d’activation ou de vérification. Ne répétez pas le paiement ; vérifiez d’abord la demande."
 ],
 SUBSCRIPTION_EXPIRED:[
  "انتهت مدة الاشتراك. تواصل مع مالك النشاط لتجديده واستعادة المميزات المشمولة.",
  "The subscription has expired. Contact the business owner to renew it and restore included features.",
  "L’abonnement a expiré. Contactez le propriétaire pour le renouveler et rétablir les fonctionnalités incluses."
 ],
 SUBSCRIPTION_CANCELLED:[
  "الاشتراك ملغي. تواصل مع مالك النشاط لمعرفة الخيارات المتاحة.",
  "The subscription is cancelled. Contact the business owner to review available options.",
  "L’abonnement est annulé. Contactez le propriétaire pour connaître les options disponibles."
 ],
 BRANCH_REQUIRED:[
  "اختر فرعًا من الفروع المعيّنة لحسابك قبل المتابعة.",
  "Select a branch assigned to your account before continuing.",
  "Sélectionnez une succursale attribuée à votre compte avant de continuer."
 ],
 STAFF_ACCESS_PENDING:[
  "حساب الموظف بانتظار التفعيل. تواصل مع مدير النشاط.",
  "Your employee access is awaiting activation. Contact the business manager.",
  "Votre accès employé est en attente d’activation. Contactez le responsable."
 ],
 STAFF_ACCESS_SUSPENDED:[
  "تم إيقاف صلاحية حساب الموظف. تواصل مع مدير النشاط.",
  "Your employee access is suspended. Contact the business manager.",
  "Votre accès employé est suspendu. Contactez le responsable."
 ],
};

export function localizedPlanNotice(code:string,locale:PlanNoticeLocale):string|undefined{
 const copy=notices[code];
 if(!copy)return undefined;
 return copy[locale==="en"?1:locale==="fr"?2:0];
}

export function localizedSubscriptionNotice(
 status:string|null|undefined,
 locale:PlanNoticeLocale,
 employee=false
):string|undefined{
 if(!status)return localizedPlanNotice("NO_ACTIVE_SUBSCRIPTION",locale);
 if(status==="active")return undefined;
 const code=status==="pending"?"SUBSCRIPTION_PENDING":status==="expired"?"SUBSCRIPTION_EXPIRED":status==="cancelled"?"SUBSCRIPTION_CANCELLED":"NO_ACTIVE_SUBSCRIPTION";
 const copy=localizedPlanNotice(code,locale);
 if(!copy||!employee)return copy;
 const staff:Record<PlanNoticeLocale,string>={
  ar:"قد تتوقف بعض الأدوات المشمولة بالباقة. تواصل مع مالك النشاط أو المدير لمعرفة التفاصيل.",
  en:"Some plan features may be unavailable. Contact the business owner or manager for details.",
  fr:"Certaines fonctionnalités de l’offre peuvent être indisponibles. Contactez le propriétaire ou le responsable."
 };
 return staff[locale];
}
