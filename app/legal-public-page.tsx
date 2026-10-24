import {cookies} from "next/headers";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {publicFooterPages} from "@/lib/platform/public-footer-pages";
import {PublicMarketShell,PublicSiteHeader,PublicSiteFooter} from "@/app/public-site-chrome";
import {resolvePublicContentLanguage,publicContentText} from "@/lib/ux/public-content-locale";
type Kind="terms"|"privacy";
type Language="ar"|"en"|"fr";
type Section={title:string;body:string};
const defaults:Record<Kind,Record<Language,{title:string;intro:string;sections:Section[]}>>={
 terms:{
  ar:{title:"الشروط والأحكام",intro:"تنظم هذه الشروط استخدام منصة FOON / NFOOD وخدماتها. يرجى قراءتها قبل إنشاء حساب أو تقديم طلب.",sections:[
   {title:"الحسابات",body:"يجب إدخال معلومات صحيحة والحفاظ على سرية بيانات الدخول. يتحمل صاحب الحساب مسؤولية الأنشطة التي تتم باستخدام حسابه، ويجب إبلاغ المنصة عن أي وصول غير مصرح به."},
   {title:"المتاجر والأنشطة",body:"يُدير كل نشاط تجاري قائمته وأسعاره وتوفّر منتجاته وخدماته وساعات عمله وشروط البيع الخاصة به. تظهر تفاصيل السعر والرسوم والضرائب إن وجدت قبل تأكيد الطلب."},
   {title:"الطلبات والحجوزات",body:"تعتمد إمكانية الطلب والحجز والتوصيل والاستلام على إعدادات النشاط وتوفر الخدمة. قد تطبق سياسة إلغاء أو استرداد خاصة بالنشاط تظهر عند الاستخدام."},
   {title:"الاستخدام المسموح",body:"يُمنع إساءة استخدام المنصة أو انتحال الهوية أو اختراق الحسابات أو نشر بيانات غير قانونية أو مضللة. يجوز تقييد الوصول عند وجود إساءة استخدام أو مخالفة للنظام."},
   {title:"التحديثات والتواصل",body:"قد تتغير الوظائف والشروط وفقًا للأنظمة المعمول بها. تُنشر الصيغة المحدثة في هذه الصفحة. للاستفسارات تواصل عبر info@nfoodz.com."}
  ]},
  en:{title:"Terms and Conditions",intro:"These terms govern the use of FOON / NFOOD and its services. Please read them before opening an account or placing an order.",sections:[
   {title:"Accounts",body:"Provide accurate information and protect your sign-in credentials. Account holders are responsible for activity under their accounts and should report unauthorized access."},
   {title:"Merchants and businesses",body:"Each merchant manages its own catalog, prices, availability, operating hours and sale conditions. Applicable taxes and fees are shown during checkout."},
   {title:"Orders and reservations",body:"Ordering, booking, pickup and delivery depend on each merchant's configuration and service availability. Merchant cancellation or refund conditions may apply."},
   {title:"Acceptable use",body:"Misuse of the service, impersonation, account compromise, and unlawful or misleading content are prohibited. Access may be restricted for abuse or legal violations."},
   {title:"Updates and contact",body:"Features and terms may change subject to applicable laws. Updated terms are published here. Contact info@nfoodz.com for questions."}
  ]},
  fr:{title:"Conditions générales",intro:"Ces conditions régissent l’utilisation de FOON / NFOOD et de ses services. Veuillez les lire avant de créer un compte ou de passer commande.",sections:[
   {title:"Comptes",body:"Fournissez des renseignements exacts et protégez vos identifiants. Le titulaire est responsable des activités de son compte et doit signaler tout accès non autorisé."},
   {title:"Commerçants",body:"Chaque commerçant gère son catalogue, ses prix, la disponibilité, ses horaires et ses conditions de vente. Les taxes et frais applicables sont affichés avant confirmation."},
   {title:"Commandes et réservations",body:"Les commandes, réservations, retraits et livraisons dépendent des paramètres et disponibilités du commerçant. Ses conditions d’annulation et de remboursement peuvent s’appliquer."},
   {title:"Utilisation acceptable",body:"L’usurpation d’identité, les abus, les intrusions et les contenus illégaux ou trompeurs sont interdits. L’accès peut être limité en cas d’abus."},
   {title:"Mises à jour et contact",body:"Les services et conditions peuvent évoluer dans le respect des lois applicables. La version actualisée paraît ici. Contact : info@nfoodz.com."}
  ]}
 },
 privacy:{
  ar:{title:"سياسة الخصوصية",intro:"توضح هذه السياسة فئات المعلومات التي تعالجها منصة FOON / NFOOD لأغراض تقديم الحسابات والطلبات والخدمات.",sections:[
   {title:"المعلومات التي نستخدمها",body:"قد تشمل البيانات الاسم والبريد الإلكتروني ومعلومات التواصل وعناوين التوصيل والطلبات والحجوزات والتفضيلات الفنية وبيانات الأمان اللازمة للخدمة."},
   {title:"أغراض المعالجة",body:"تُستخدم البيانات لإدارة الحسابات والتحقق من البريد الإلكتروني وتنفيذ الطلبات والحجوزات وإرسال الإشعارات ودعم المستخدم والحماية من إساءة الاستخدام."},
   {title:"مشاركة المعلومات",body:"قد تتاح تفاصيل الطلب والخدمة اللازمة للتنفيذ للنشاط التجاري المختار ولجهات التقنية أو الدفع أو التوصيل المشاركة في تقديم الخدمة، بحسب إعدادات الخدمة والأنظمة."},
   {title:"ملفات تعريف الارتباط وتسجيل Google",body:"تُستخدم وسائل الجلسات والحماية لتسجيل الدخول والحفاظ على حالة الحساب. وعند اختيار تسجيل الدخول بحساب Google، تُستخدم بيانات الهوية المصرح بها لإتمام المصادقة."},
   {title:"الاحتفاظ والطلبات",body:"تُدار مدة الاحتفاظ وطلبات الوصول إلى البيانات أو تصحيحها أو حذفها وفق المتطلبات التشغيلية والنظامية المنطبقة. للاستفسار عن بياناتك تواصل عبر info@nfoodz.com."}
  ]},
  en:{title:"Privacy Policy",intro:"This policy describes the categories of information FOON / NFOOD may process to provide accounts, orders, reservations and services.",sections:[
   {title:"Information used",body:"Information may include your name, email, contact details, delivery addresses, orders, bookings, service preferences and security-related information."},
   {title:"Purposes",body:"Information is used for account management, email verification, order and reservation processing, notifications, user support and abuse prevention."},
   {title:"Sharing",body:"Relevant order details may be made available to the selected merchant and technology, payment or delivery providers involved in delivering the requested service, subject to the service setup and applicable law."},
   {title:"Cookies and Google sign-in",body:"Session and security mechanisms support sign-in and account continuity. If you select Google sign-in, authorized identity information is used for authentication."},
   {title:"Retention and requests",body:"Retention and requests to access, correct or delete personal information are handled in line with applicable operational and legal requirements. Contact info@nfoodz.com."}
  ]},
  fr:{title:"Politique de confidentialité",intro:"Cette politique présente les catégories de données que FOON / NFOOD peut traiter pour fournir des comptes, commandes, réservations et services.",sections:[
   {title:"Données utilisées",body:"Les données peuvent comprendre le nom, l’e-mail, les coordonnées, les adresses de livraison, les commandes, les réservations et les informations nécessaires à la sécurité."},
   {title:"Finalités",body:"Les données servent à gérer les comptes, vérifier les e-mails, traiter les commandes et réservations, envoyer les notifications, assister les utilisateurs et prévenir les abus."},
   {title:"Partage",body:"Les informations nécessaires au service peuvent être accessibles au commerçant choisi et aux prestataires techniques, de paiement ou de livraison concernés, selon le service et la loi applicable."},
   {title:"Cookies et connexion Google",body:"Les mécanismes de session et de sécurité facilitent l’authentification. Si vous choisissez Google, les données d’identité autorisées sont utilisées pour vous connecter."},
   {title:"Conservation et demandes",body:"La conservation et les demandes d’accès, de correction ou de suppression sont traitées conformément aux obligations applicables. Contact : info@nfoodz.com."}
  ]}
 }
};
export default async function LegalPublicPage({kind}:{kind:Kind}){
 const locale=(await cookies()).get("foon_language")?.value;
 const language=resolvePublicContentLanguage(undefined,locale);
 const fallback=defaults[kind][language];
 let published:{title:string;body:string}|null=null;
 try{
  const [rows]=await database().execute<RowDataPacket[]>("SELECT title_ar,title_en,title_fr,body_ar,body_en,body_fr FROM platform_content_pages WHERE slug=? AND status='published' LIMIT 1",[kind]);
  if(rows.length){
   const body=publicContentText(rows[0],"body",language).trim();
   if(body)published={title:publicContentText(rows[0],"title",language)||fallback.title,body};
  }
 }catch{/* Public legal page remains available even when CMS is unavailable. */}
 return <PublicMarketShell languageOverride={language} className="foonPublicContent"><PublicSiteHeader languageOverride={language}/>
  <main className="publicContentPage" dir={language==="ar"?"rtl":"ltr"} lang={language} style={{maxWidth:880,margin:"auto",padding:"24px 16px",overflowWrap:"anywhere"}}>
   <article><h1>{published?.title??fallback.title}</h1>{published?<div className="publicContentBody" style={{whiteSpace:"pre-wrap",lineHeight:1.9}}>{published.body}</div>:<><p>{fallback.intro}</p>{fallback.sections.map(s=><section key={s.title} style={{marginTop:22,lineHeight:1.9}}><h2 style={{fontSize:"1.2rem"}}>{s.title}</h2><p>{s.body}</p></section>)}</>}</article>
  </main><PublicSiteFooter languageOverride={language} pages={await publicFooterPages()}/></PublicMarketShell>;
}
