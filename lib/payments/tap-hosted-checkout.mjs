import {currencyDecimals,majorToMinor} from "./webhook-verification.mjs";
const fail=code=>{throw new Error(code);};
function callback(value){
 try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.hash)fail("INVALID_CHECKOUT_CALLBACK");return url.href;}catch{fail("INVALID_CHECKOUT_CALLBACK");}
}
function reference(value){
 if(typeof value!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(value))fail("INVALID_CHECKOUT_REFERENCE");
 return value;
}
function hostedUrl(value){
 try{const url=new URL(value);if(url.protocol!=="https:"||url.username||url.password||url.port||!(url.hostname==="tap.company"||url.hostname.endsWith(".tap.company")))fail("INVALID_GATEWAY_RESPONSE");return url.href;}catch{fail("INVALID_GATEWAY_RESPONSE");}
}
async function responseBody(response){
 const reader=response.body?.getReader();if(!reader)fail("INVALID_GATEWAY_RESPONSE");
 const chunks=[];let length=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>65536)fail("INVALID_GATEWAY_RESPONSE");chunks.push(Buffer.from(value));}}
 finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{fail("INVALID_GATEWAY_RESPONSE");}
}
/**
 * Trusted server adapter only. No route currently activates electronic checkout.
 * The caller must persist the idempotency key BEFORE invoking this function,
 * reuse it after ambiguous failures, and register the returned paymentId in a
 * committed payment attempt before exposing the redirect URL to the customer.
 * Never use this adapter's response or a browser redirect as proof of payment.
 */
export async function createTapHostedCheckout(input,fetcher=fetch){
 const {mode,secretKey,amountMinor,currency,orderReference,idempotencyKey,webhookUrl,returnUrl,customer}=input;
 if(!["test","live"].includes(mode)||typeof secretKey!=="string"||!secretKey.startsWith("sk_"+mode+"_")||secretKey.length>4096||/[\r\n]/.test(secretKey))fail("PAYMENT_KEY_MODE_MISMATCH");
 if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||amountMinor>9999999999)fail("INVALID_CHECKOUT_AMOUNT");
 const precision=currencyDecimals(currency),amount=Number((amountMinor/10**precision).toFixed(precision));
 const order=reference(orderReference),idempotent=reference(idempotencyKey);
 const post=callback(webhookUrl),redirect=callback(returnUrl);
 if(!customer||typeof customer.name!=="string"||!customer.name.trim()||customer.name.length>100||typeof customer.email!=="string"||customer.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))fail("INVALID_CHECKOUT_CUSTOMER");
 const body={amount,currency,customer_initiated:true,threeDSecure:true,save_card:false,
  description:"FOON order "+order,reference:{order,transaction:idempotent,idempotent},
  receipt:{email:false,sms:false},customer:{first_name:customer.name.trim(),email:customer.email},
  source:{id:"src_all"},post:{url:post},redirect:{url:redirect}};
 let response;
 try{response=await fetcher("https://api.tap.company/v2/charges/",{method:"POST",redirect:"error",signal:AbortSignal.timeout(15000),headers:{Authorization:"Bearer "+secretKey,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(body)});}catch{fail("GATEWAY_REQUEST_UNCERTAIN");}
 // Do not echo provider bodies: they may contain personal data or credentials.
 if(!response.ok){await response.body?.cancel().catch(()=>{});fail("GATEWAY_REQUEST_REJECTED");}
 const charge=await responseBody(response);
 if(!charge||charge.object!=="charge"||typeof charge.id!=="string"||!/^chg_[a-zA-Z0-9_-]{1,175}$/.test(charge.id)||charge.live_mode!==(mode==="live")||charge.currency!==currency)fail("INVALID_GATEWAY_RESPONSE");
 let received;try{received=majorToMinor(charge.amount,currency);}catch{fail("INVALID_GATEWAY_RESPONSE");}
 if(received!==amountMinor)fail("INVALID_GATEWAY_RESPONSE");
 if(charge.status!=="INITIATED")fail("GATEWAY_NOT_REDIRECTABLE");
 return {paymentId:charge.id,url:hostedUrl(charge.transaction?.url),mode,amountMinor,currency};
}
