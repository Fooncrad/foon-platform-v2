/** Order-level merchant charges. All persisted amounts use currency minor units. */
export type CheckoutPolicy={enabled:boolean;rate:number;inclusive:boolean;serviceFee:number;deliveryFee:number;roomServiceFee?:number;feesTaxable:boolean;feesInclusive:boolean};
export type CheckoutTotals={subtotal:number;discount:number;serviceFee:number;deliveryFee:number;net:number;tax:number;total:number;rate:number;inclusive:boolean};
export function checkoutPolicy(data:Record<string,unknown>):CheckoutPolicy{
 const amount=(key:string)=>{const value=data[key];if(value===undefined||value===null||value==="")return 0;if(typeof value!=="number"||!Number.isFinite(value)||value<0||value>100000||Math.abs(value*100-Math.round(value*100))>1e-7)throw Error("INVALID_CHECKOUT_SETTINGS");return value;};
 const enabled=data.vatEnabled==="yes",rate=data.vatRate;
 if(enabled&&(typeof rate!=="number"||!Number.isFinite(rate)||rate<0||rate>100))throw Error("INVALID_CHECKOUT_SETTINGS");
 return {enabled,rate:enabled?Number(rate):0,inclusive:data.menuStoredPricesIncludeVat==="yes",serviceFee:amount("checkoutServiceFee"),deliveryFee:amount("checkoutDeliveryFee"),roomServiceFee:amount("checkoutRoomServiceFee"),feesTaxable:data.checkoutFeesTaxable==="yes",feesInclusive:data.checkoutFeesIncludeVat!=="no"};
}
export function checkoutTotals(subtotal:number,discount:number,channel:string,policy:CheckoutPolicy):CheckoutTotals{
 const minor=(n:number)=>{const v=Math.round(n*100);if(!Number.isFinite(n)||n<0||!Number.isSafeInteger(v)||Math.abs(n*100-v)>1e-7)throw Error("INVALID_CHECKOUT_AMOUNT");return v;};
 const sub=minor(subtotal),off=minor(discount);if(off>sub)throw Error("INVALID_CHECKOUT_DISCOUNT");
 if(!Number.isFinite(policy.rate)||policy.rate<0||policy.rate>100)throw Error("INVALID_CHECKOUT_SETTINGS");
 const service=minor(policy.serviceFee)+(channel==="room_service"?minor(policy.roomServiceFee??0):0),delivery=channel==="delivery"?minor(policy.deliveryFee):0,base=sub-off,fees=service+delivery;
 const rate=policy.enabled?policy.rate:0;
 const split=(value:number,inclusive:boolean,r:number)=>{const tax=Math.round(inclusive?value*r/(100+r):value*r/100);return {net:inclusive?value-tax:value,tax};};
 const goods=split(base,policy.inclusive,rate),charges=split(fees,policy.feesInclusive,policy.feesTaxable?rate:0),net=goods.net+charges.net,tax=goods.tax+charges.tax,total=net+tax;
 if(!Number.isSafeInteger(total)||total>999999999999)throw Error("INVALID_CHECKOUT_AMOUNT");
 return {subtotal:sub/100,discount:off/100,serviceFee:service/100,deliveryFee:delivery/100,net:net/100,tax:tax/100,total:total/100,rate,inclusive:policy.inclusive};
}
