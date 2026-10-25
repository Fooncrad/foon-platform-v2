import Link from "next/link";
import {publicStorefrontUrl} from "@/lib/tenant/workspace-routes";

type Locale = "ar" | "en" | "fr";
type Store = {id: string | number; name: string; slug: string; order_count: number | string};
type Order = {id: string | number; status: string; payment_status: string; store_slug: string; store_name: string; total: string | number; currency: string};

const copy = {
 ar: {title:"مركز تسوقي",subtitle:"مسارات سريعة للعودة إلى متاجرك ومتابعة مشترياتك.",total:"طلب مسجل",stores:"متجر مرتبط",paid:"طلبات مدفوعة",repeat:"إعادة الطلب",discover:"استكشف متاجر جديدة",recent:"عد إلى متجرك الأخير",hint:"تُعرض الطلبات المسجلة في حسابك فقط. الأسعار والتوفر يعاد التحقق منهما قبل كل شراء.",empty:"ابدأ باستكشاف المتاجر لحفظ تجربة شراء أسرع لاحقًا."},
 en: {title:"My shopping hub",subtitle:"Quick ways to return to your stores and follow purchases.",total:"Recorded orders",stores:"Linked stores",paid:"Paid orders",repeat:"Order again",discover:"Discover stores",recent:"Return to your latest store",hint:"Only orders on your account are shown. Prices and availability are checked again at checkout.",empty:"Explore stores to make your next purchase easier."},
 fr: {title:"Mon espace achats",subtitle:"Retrouvez vos boutiques et suivez vos achats.",total:"Commandes enregistrées",stores:"Boutiques liées",paid:"Commandes payées",repeat:"Commander à nouveau",discover:"Découvrir les boutiques",recent:"Retourner à la dernière boutique",hint:"Seules les commandes de votre compte sont affichées. Prix et disponibilités sont revérifiés avant l’achat.",empty:"Explorez les boutiques pour faciliter votre prochain achat."}
} as const;

export default function CustomerGrowthHub({language, stores, orders}:{language:Locale;stores:Store[];orders:Order[]}) {
 const t=copy[language];
 const paid=orders.filter(o=>o.payment_status==="paid"&&!["cancelled","rejected","refunded"].includes(o.status)).length;
 const latest=orders.find(o=>Boolean(o.store_slug));
 const popular=[...stores].sort((a,b)=>Number(b.order_count)-Number(a.order_count)).slice(0,3);
 return <section aria-labelledby="customer-growth-title" className="customerPortalDetails" id="customer-growth-hub">
   <h2 id="customer-growth-title">{t.title}</h2><p>{t.subtitle}</p>
   <div className="customerGrowthStats">
    <div><strong>{orders.length}</strong><span>{t.total}</span></div>
    <div><strong>{stores.length}</strong><span>{t.stores}</span></div>
    <div><strong>{paid}</strong><span>{t.paid}</span></div>
   </div>
   <nav aria-label={t.title} className="customerGrowthActions">
    <Link href="/market">{t.discover}</Link>
    {latest&&<Link href={publicStorefrontUrl(String(latest.store_slug))}>{t.recent}</Link>}
    <a href="#customer-orders">{t.repeat}</a>
   </nav>
   {popular.length?<div className="customerGrowthStores">{popular.map(s=><Link key={String(s.id)} href={publicStorefrontUrl(String(s.slug))}>{String(s.name)} <span aria-hidden="true">↗</span></Link>)}</div>:<p>{t.empty}</p>}
   <p className="customerGrowthHint">{t.hint}</p>
 </section>;
}
