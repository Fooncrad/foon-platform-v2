/** Public customer journeys are separate from the shared staff POS. */
export function customerCheckout(activity:string,legacyKind?:string):"cart"|"service-cart"|"appointment"|"quote"|null{
 if(["restaurant","cafe","sweets","grocery","clothing","perfume","accessories","watches","gifts","ecommerce"].includes(activity))return "cart";
 if(activity==="laundry")return "service-cart";
 if(["carwash","salon","automotive"].includes(activity))return "appointment";
 if(activity==="publicworks")return "quote";
 return !activity&&legacyKind==="restaurant"?"cart":null;
}
export function customerCartAvailable(activity:string,legacyKind?:string){
 const mode=customerCheckout(activity,legacyKind);return mode==="cart"||mode==="service-cart";
}
