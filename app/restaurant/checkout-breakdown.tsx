"use client";
import {checkoutPolicy,checkoutTotals,type CheckoutPolicy} from "@/lib/restaurant/checkout-pricing";
export default function CheckoutBreakdown({subtotal,channel,policy,currency,language}:{subtotal:number;channel:string;policy?:CheckoutPolicy;currency:string;language:"ar"|"en"|"fr"}){
 const t=(ar:string,en:string,fr:string)=>language==="ar"?ar:language==="en"?en:fr;
 if(!policy)return null;
 let amounts;try{amounts=checkoutTotals(Math.round(subtotal*100)/100,0,channel,policy??checkoutPolicy({}));}catch{return <p role="alert">{t("تعذر حساب الإجمالي","Unable to calculate total","Calcul du total impossible")}</p>;}
 return <dl style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:8,marginBlock:12}}>{([[t("رسوم الخدمة","Service fee","Frais de service"),amounts.serviceFee],[t("رسوم التوصيل","Delivery fee","Frais de livraison"),amounts.deliveryFee],[t("الضريبة","Tax","Taxe")+" ("+amounts.rate+"%)",amounts.tax],[t("الإجمالي التقديري قبل الكوبون","Estimated total before coupon","Total estimé avant coupon"),amounts.total]] as const).filter(([,value],index)=>value>0||index===3).map(([label,value])=><span key={label} style={{display:"contents"}}><dt>{label}</dt><dd style={{margin:0}} dir="ltr">{value.toFixed(2)} {currency}</dd></span>)}</dl>;
}
