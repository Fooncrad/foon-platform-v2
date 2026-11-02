import Link from "next/link";
import {publicStorefrontUrl} from "@/lib/tenant/workspace-routes";

type Lang="ar"|"en"|"fr";
type Props={language:Lang;verified:boolean;profileComplete:boolean;recentOrders:number;activeOrders:number;upcomingReservations:number;unreadNotifications:number;latestOrder?:{id:string;number:string;store:string}|null;returnStore?:{name:string;slug:string}|null};
export default function CustomerActionHub({language,verified,profileComplete,recentOrders,activeOrders,upcomingReservations,unreadNotifications,latestOrder,returnStore}:Props){
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 const next=!verified?{title:t("وثّق بريدك الإلكتروني","Verify your email","Vérifiez votre e-mail"),desc:t("التوثيق مطلوب قبل إنشاء طلب أو حجز. لن تُرسل بياناتك إلى المتاجر من هذه الخطوة.","Required before placing orders or reservations.","Obligatoire avant les commandes et réservations."),href:"/verify-email",label:t("التحقق الآن","Verify now","Vérifier")}
  :activeOrders>0?{title:t("لديك طلب قيد التنفيذ","An order needs your attention","Une commande est en cours"),desc:latestOrder?t("تابع الطلب رقم ","Track order #","Suivez la commande n° ")+latestOrder.number+" · "+latestOrder.store:t("افتح قائمة طلباتك لمتابعة الحالة.","Open your orders to check the status.","Ouvrez vos commandes pour suivre l'état."),href:latestOrder?"#customer-order-"+latestOrder.id:"#customer-orders",label:t("متابعة الطلب","Track order","Suivre")}
  :upcomingReservations>0?{title:t("لديك حجز قادم","You have an upcoming reservation","Vous avez une réservation"),desc:t("راجع الموعد وحالة التأكيد في حجوزاتي.","Check its date and confirmation under Bookings.","Vérifiez l'heure et la confirmation."),href:"#customer-reservations",label:t("عرض الحجز","View booking","Voir")}
  :unreadNotifications>0?{title:t("لديك إشعارات جديدة","You have new notifications","Vous avez des notifications"),desc:t("راجع المستجدات المتعلقة بحسابك وطلباتك.","Review updates about your account and orders.","Consultez les nouveautés de votre compte."),href:"#customer-notifications",label:t("فتح الإشعارات","Open notifications","Ouvrir")}
  :!profileComplete?{title:t("أكمل معلومات التواصل","Complete your contact details","Complétez vos coordonnées"),desc:t("حدّث اسمك ورقمك لتصبح متابعة طلباتك أسهل.","Update your name and phone to streamline your orders.","Mettez à jour votre nom et numéro."),href:"#account-settings",label:t("إكمال الحساب","Complete profile","Compléter")}
  :{title:t("حسابك جاهز للاستكشاف","Ready to discover something new","Prêt à découvrir"),desc:t("استكشف المتاجر أو عُد لأحد متاجرك السابقة.","Browse the marketplace or revisit a previous store.","Explorez les boutiques ou revenez à une boutique."),href:"/market",label:t("استكشف الآن","Explore now","Explorer")};
 const stats=[{value:recentOrders,label:t("طلبات ظاهرة","Recent orders","Commandes récentes"),href:"#customer-orders"},{value:activeOrders,label:t("قيد المتابعة","In progress","En cours"),href:"#customer-orders"},{value:upcomingReservations,label:t("حجوزات قادمة","Upcoming bookings","Réservations à venir"),href:"#customer-reservations"},{value:unreadNotifications,label:t("غير مقروءة","Unread alerts","Non lues"),href:"#customer-notifications"}];
 return <section id="customer-command-center" className="customerActionHub" aria-labelledby="customer-command-heading">
  <div className="customerActionHeading"><div><span className="customerActionEyebrow">{t("مركز العميل الذكي","Your customer command center","Votre espace intelligent")}</span><h2 id="customer-command-heading">{t("كل ما تحتاجه، في مكان واحد","Everything you need, one place","Tout au même endroit")}</h2><p>{t("الأولوية لما يحتاج إجراء، ثم الوصول السريع دون البحث داخل الصفحة.","Your next action first, then easy access without hunting through the page.","Votre prochaine action d'abord, puis un accès direct.")}</p></div><Link className="customerHubDiscover" href="/market">{t("اكتشف المتاجر","Explore stores","Découvrir")}</Link></div>
  <div className="customerActionMetrics">{stats.map((s,i)=><a href={s.href} key={s.href+"-"+i} aria-label={s.label+" "+s.value}><strong dir="ltr">{s.value.toLocaleString("en-US")}</strong><span>{s.label}</span></a>)}</div>
  <div className="customerNextAction"><div><small>{t("إجراء مقترح بناءً على حالة حسابك","Suggested next step based on your account","Prochaine étape selon votre compte")}</small><h3>{next.title}</h3><p>{next.desc}</p></div><a href={next.href}>{next.label} <span aria-hidden="true">↗</span></a></div>
  <div className="customerQuickActions">
   <a href="#customer-orders"><span aria-hidden="true">▣</span>{t("متابعة الطلبات","My orders","Mes commandes")}</a>
   <a href="#customer-reservations"><span aria-hidden="true">◷</span>{t("الحجوزات والمواعيد","Bookings","Réservations")}</a>
   <a href="#customer-invoices"><span aria-hidden="true">▤</span>{t("الفواتير","Invoices","Factures")}</a>
   <a href="#customer-addresses"><span aria-hidden="true">⌖</span>{t("عناويني","Addresses","Adresses")}</a>
   <a href="#customer-passport"><span aria-hidden="true">✦</span>{t("نقاط الولاء","Loyalty points","Points fidélité")}</a>
   <a href="#customer-journey"><span aria-hidden="true">◇</span>{t("سجل رحلتي","My timeline","Mon parcours")}</a>
   <a href="#customer-security-center"><span aria-hidden="true">◈</span>{t("الأجهزة والأمان","Device security","Appareils et sécurité")}</a>
   <Link href="/customer/creator"><span aria-hidden="true">◎</span>{t("بروفايلي العام","Public creator profile","Profil public")}</Link>
   {returnStore&&<Link href={publicStorefrontUrl(returnStore.slug)}><span aria-hidden="true">↻</span>{t("العودة إلى ","Return to ","Retour à ")}{returnStore.name}</Link>}
  </div>
  <p className="customerHubPrivacy">◈ {t("هذا الملخص خاص بك. بيانات الطلبات والعناوين لا تُعرض في بروفايلك العام؛ نشر بروفايل صانع المحتوى اختياري.","This dashboard is private. Orders and addresses do not appear on your public creator profile; publishing is optional.","Cet espace est privé. Commandes et adresses ne sont pas publiées ; le profil créateur est facultatif.")}</p>
 </section>;
}
