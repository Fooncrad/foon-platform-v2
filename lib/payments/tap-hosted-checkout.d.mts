export type TapCheckoutInput={mode:"test"|"live";secretKey:string;amountMinor:number;currency:string;orderReference:string;idempotencyKey:string;webhookUrl:string;returnUrl:string;customer:{name:string;email:string}};
export function createTapHostedCheckout(input:TapCheckoutInput,fetcher?:typeof fetch):Promise<{paymentId:string;url:string;mode:"test"|"live";amountMinor:number;currency:string}>;
