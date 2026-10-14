/** Pure monetary calculations for order previews and upcoming server-side integration.
 * Amounts are decimal major-currency units; integer minor units avoid float drift.
 * Tax rates are percentages. Inclusive and exclusive prices are supported.
 * This module does not change order persistence or production invoices.
 */
export type TaxBreakdown = {net:number;tax:number;gross:number};
const money=(value:number)=>{if(!Number.isFinite(value)||value<0)throw new RangeError("INVALID_AMOUNT");return Math.round((value+Number.EPSILON)*100)};
const percent=(value:number)=>{if(!Number.isFinite(value)||value<0||value>100)throw new RangeError("INVALID_TAX_RATE");return value};
export function calculateTax(amount:number,rate:number,inclusive=false):TaxBreakdown {
 const minor=money(amount),r=percent(rate);
 const tax=inclusive?Math.round(minor*r/(100+r)):Math.round(minor*r/100);
 const net=inclusive?minor-tax:minor;
 return {net:net/100,tax:tax/100,gross:(net+tax)/100};
}
export function calculateOrderTax(subtotal:number,discount:number,rate:number,inclusive=false):TaxBreakdown {
 const sub=money(subtotal),off=money(discount);
 if(off>sub)throw new RangeError("DISCOUNT_EXCEEDS_SUBTOTAL");
 return calculateTax((sub-off)/100,rate,inclusive);
}
