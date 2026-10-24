import Link from "next/link";
import {publicStorefrontUrl} from "@/lib/tenant/workspace-routes";
type Lang="ar"|"en"|"fr";
export type LoyaltyWallet={id:string;name:string;slug:string;points:number;minRedeemPoints:number};
export default function CustomerLoyaltyPassport({language,wallets,unavailable}:{language:Lang;wallets:LoyaltyWallet[];unavailable:boolean}){
 const t=(ar:string,en:string,fr:string)=>language==="en"?en:language==="fr"?fr:ar;
 return <section id="customer-passport" className="customerPassport" aria-labelledby="customer-passport-title">
  <header><div><small>FOON PASSPORT</small><h2 id="customer-passport-title">{t("جواز المكافآت","Loyalty passport","Passeport fidélité")}</h2><p>{t("لكل متجر نقاطه وسياسة استبداله الخاصة؛ لا ندمج أرصدة المتاجر أو نستبدل النقاط دون طلبك.","Each store has separate points and redemption rules. Balances are not pooled or redeemed automatically.","Chaque commerce a ses points et ses règles, sans échange automatique.")}</p></div><span aria-hidden="true">✦</span></header>
  {unavailable?<p role="alert">{t("تعذر تحميل نقاط الولاء مؤقتًا؛ بقية حسابك متاحة.","Loyalty balances are temporarily unavailable; your account still works.","Soldes de fidélité temporairement indisponibles.")}</p>:wallets.length?<div className="customerLoyaltyGrid">{wallets.map(item=><article key={item.id}><small>{t("متجر مرتبط بحسابي","Linked store","Boutique associée")}</small><h3>{item.name}</h3><strong dir="ltr">{item.points.toLocaleString("en-US")} <small>{t("نقطة","points","points")}</small></strong><p>{item.minRedeemPoints>0?t("الحد الأدنى للاستبدال: ","Minimum redemption: ","Seuil d’échange : ")+item.minRedeemPoints.toLocaleString("en-US"):t("الاستبدال وفق سياسة المتجر.","Redemption follows store policy.","Échange selon la boutique.")}</p><Link href={publicStorefrontUrl(item.slug)}>{t("زيارة المتجر","Visit store","Visiter")}</Link></article>)}</div>:<p>{t("لا توجد برامج نقاط نشطة للمتاجر المرتبطة بحسابك حاليًا.","No active loyalty programs are linked to your account yet.","Aucun programme de fidélité actif pour vos boutiques.")}</p>}
 </section>;
}
