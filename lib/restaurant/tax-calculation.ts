/** Pure monetary calculations for order previews and upcoming server-side integration.
 * Amounts are decimal major-currency units; integer minor units avoid float drift.
 * Tax rates are percentages. Inclusive and exclusive prices are supported.
 * This module does not change order persistence or production invoices.
 */
export type TaxBreakdown = {net:number;tax:number;gross:number};
const money=(value:number)=>{
 if(!Number.isFinite(value)||value<0)throw new RangeError("INVALID_AMOUNT");
 const scaled=value*100,minor=Math.round(scaled);
 // Reject fractions of a minor unit rather than silently changing the checkout base.
 // Allow tiny binary floating-point drift in otherwise valid two-decimal values.
 if(!Number.isSafeInteger(minor)||Math.abs(scaled-minor)>1e-7)throw new RangeError("INVALID_AMOUNT_PRECISION");
 return minor;
};
const percent=(value:number)=>{if(!Number.isFinite(value)||value<0||value>100)throw new RangeError("INVALID_TAX_RATE");return value};
export function calculateTax(amount:number,rate:number,inclusive=false):TaxBreakdown {
 const minor=money(amount),r=percent(rate);
 const tax=inclusive?Math.round(minor*r/(100+r)):Math.round(minor*r/100);
 const net=inclusive?minor-tax:minor,gross=net+tax;
 // Input cents can be safe while tax addition overflows or splitting large
 // inclusive amounts loses minor units when converted back to decimal.
 if(![net,tax,gross].every(value=>Number.isSafeInteger(value)&&Math.round(value/100*100)===value))
  throw new RangeError("INVALID_AMOUNT_PRECISION");
 return {net:net/100,tax:tax/100,gross:gross/100};
}
export function calculateOrderTax(subtotal:number,discount:number,rate:number,inclusive=false):TaxBreakdown {
 const sub=money(subtotal),off=money(discount);
 if(off>sub)throw new RangeError("DISCOUNT_EXCEEDS_SUBTOTAL");
 return calculateTax((sub-off)/100,rate,inclusive);
}
