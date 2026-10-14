export type VerifiedPaymentWebhook={eventKey:string;eventType:string;paymentId:string|null;amountMinor:number|null;currency:string|null;paid:boolean};
export class WebhookError extends Error{}
export function currencyDecimals(currency:string):number;
export function majorToMinor(amount:string|number,currency:string):number;
export function verifyPaymentWebhook(input:{provider:string;mode:string;raw:string;headers:Headers;credentials:Record<string,string>;merchantReference?:string|null;now?:number}):VerifiedPaymentWebhook;

