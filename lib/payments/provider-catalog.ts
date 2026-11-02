export type PaymentLanguage='ar'|'en'|'fr';
export type PaymentProvider='manual'|'moyasar'|'tap'|'hyperpay'|'stripe'|'custom';
export type PaymentMode='test'|'live';
export type CredentialName='secret_key'|'webhook_secret';
export const PAYMENT_PROVIDERS:Record<PaymentProvider,{name:string;publicKey:boolean;merchantRequired:boolean;webhook:boolean;docs:string|null}>={
 manual:{name:'Cash',publicKey:false,merchantRequired:false,webhook:false,docs:null},
 moyasar:{name:'Moyasar',publicKey:true,merchantRequired:false,webhook:true,docs:'https://docs.moyasar.com/'},
 tap:{name:'Tap',publicKey:true,merchantRequired:false,webhook:false,docs:'https://developers.tap.company/docs/get-started'},
 hyperpay:{name:'HyperPay',publicKey:false,merchantRequired:true,webhook:true,docs:'https://hyperpay.docs.oppwa.com/'},
 stripe:{name:'Stripe',publicKey:true,merchantRequired:false,webhook:true,docs:'https://docs.stripe.com/keys'},
 custom:{name:'Other gateway',publicKey:true,merchantRequired:true,webhook:true,docs:null}
};
export function isPaymentProvider(value:unknown):value is PaymentProvider{return typeof value==='string'&&Object.hasOwn(PAYMENT_PROVIDERS,value);}
export function validatePaymentKeys(provider:PaymentProvider,mode:PaymentMode,publicKey:string,secretKey:string){
 if(['moyasar','tap','stripe'].includes(provider)){
  if(publicKey&&!publicKey.startsWith('pk_'+mode+'_'))throw new Error('PAYMENT_KEY_MODE_MISMATCH');
  if(secretKey&&!secretKey.startsWith('sk_'+mode+'_')&&!(provider==='stripe'&&secretKey.startsWith('rk_'+mode+'_')))throw new Error('PAYMENT_KEY_MODE_MISMATCH');
 }
}
export function paymentMissingFields(provider:PaymentProvider,publicKey:string|null,reference:string|null,secrets:Record<string,boolean>){
 if(provider==='manual')return reference?[]:['merchant_reference'];
 const profile=PAYMENT_PROVIDERS[provider],missing:string[]=[];
 if(profile.publicKey&&!publicKey)missing.push('public_key');
 if(profile.merchantRequired&&!reference)missing.push('merchant_reference');
 if(!secrets.secret_key)missing.push('secret_key');
 if(profile.webhook&&!secrets.webhook_secret)missing.push('webhook_secret');
 return missing;
}
