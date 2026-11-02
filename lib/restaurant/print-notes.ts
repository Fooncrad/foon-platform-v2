/** Labels and visibility for POS kitchen-ticket notes. Never render internal notes on customer receipts. */
export type PrintNote = {label:string;value:string};
export function kitchenTicketNotes(order:{kitchen_notes?:unknown;order_notes?:unknown},locale:"ar"|"en"|"fr"):PrintNote[]{
 const labels={ar:["ملاحظات المطبخ","ملاحظات الطلب"],en:["Kitchen notes","Order notes"],fr:["Notes de cuisine","Notes de commande"]} as const;
 const values=[order.kitchen_notes,order.order_notes];
 return values.flatMap((value,index)=>typeof value==="string"&&value.trim()?[{label:labels[locale][index],value:value.trim()}]:[]);
}
