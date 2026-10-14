import {createHash,createHmac,createDecipheriv,timingSafeEqual} from "node:crypto";
export class WebhookError extends Error{}
const fail=code=>{throw new WebhookError(code);};
const digest=value=>createHash("sha256").update(String(value)).digest();
function same(a,b){return typeof a==="string"&&typeof b==="string"&&a.length<=4096&&b.length>0&&timingSafeEqual(digest(a),digest(b));}
function json(raw){try{const value=JSON.parse(raw);if(!value||typeof value!=="object"||Array.isArray(value))fail("INVALID_WEBHOOK");return value;}catch{fail("INVALID_WEBHOOK");}}
function id(value){if(typeof value!=="string"||!value||value.length>180)fail("INVALID_WEBHOOK");return value;}
const decimals={BHD:3,KWD:3,OMR:3,JOD:3,JPY:0,KRW:0,XOF:0,XAF:0};
export function currencyDecimals(currency){if(typeof currency!=="string"||!/^[A-Z]{3}$/.test(currency))fail("INVALID_WEBHOOK");return decimals[currency]??2;}
export function majorToMinor(amount,currency){
 const value=String(amount),precision=currencyDecimals(currency);
 if(!/^\d{1,10}(\.\d{1,3})?$/.test(value))fail("INVALID_WEBHOOK");
 const [whole,part=""]=value.split(".");
 if(part.slice(precision).replace(/0/g,""))fail("INVALID_WEBHOOK");
 const minor=Number(whole)*10**precision+Number(part.slice(0,precision).padEnd(precision,"0"));
 if(!Number.isSafeInteger(minor))fail("INVALID_WEBHOOK");return minor;
}
function minorAmount(value){if(!Number.isSafeInteger(value)||value<0)fail("INVALID_WEBHOOK");return value;}
function normalized({eventId,type,paymentId,amount,currency,paid}){
 if(typeof type!=="string"||type.length>100)fail("INVALID_WEBHOOK");
 if(paymentId!==null)id(paymentId);
 const eventKey=createHash("sha256").update(JSON.stringify([id(eventId),type,paymentId,amount,currency])).digest("hex");
 return {eventKey,eventType:type,paymentId,amountMinor:amount,currency,paid:Boolean(paid)};
}
export function verifyPaymentWebhook({provider,mode,raw,headers,credentials,merchantReference,now=Math.floor(Date.now()/1000)}){
 if(typeof raw!=="string"||Buffer.byteLength(raw)>131072)fail("INVALID_WEBHOOK");
 if(provider==="stripe"){
  const signature=headers.get("stripe-signature")??"",parts=signature.split(",").map(p=>p.trim().split("="));
  const times=parts.filter(p=>p[0]==="t");if(times.length!==1||!/^\d+$/.test(times[0][1]??""))fail("INVALID_SIGNATURE");
  const timestamp=Number(times[0][1]);if(!Number.isSafeInteger(timestamp)||Math.abs(now-timestamp)>300)fail("STALE_SIGNATURE");
  if(!credentials.webhook_secret)fail("WEBHOOK_NOT_CONFIGURED");
  const expected=createHmac("sha256",credentials.webhook_secret).update(timestamp+"."+raw).digest("hex");
  if(!parts.some(p=>p[0]==="v1"&&same(expected,p[1])))fail("INVALID_SIGNATURE");
  const event=json(raw);if(event.livemode!==(mode==="live"))fail("WEBHOOK_MODE_MISMATCH");
  const payment=event.data?.object;
  if(event.type!=="payment_intent.succeeded")return normalized({eventId:event.id,type:event.type,paymentId:null,amount:null,currency:null,paid:false});
  if(payment?.object!=="payment_intent"||payment.status!=="succeeded")fail("INVALID_WEBHOOK");
  const currency=String(payment.currency??"").toUpperCase();currencyDecimals(currency);
  return normalized({eventId:event.id,type:event.type,paymentId:id(payment.id),amount:minorAmount(payment.amount_received),currency,paid:true});
 }
 if(provider==="moyasar"){
  const event=json(raw);
  if(!credentials.webhook_secret)fail("WEBHOOK_NOT_CONFIGURED");
  if(!same(event.secret_token,credentials.webhook_secret))fail("INVALID_SIGNATURE");
  if(event.live!==(mode==="live"))fail("WEBHOOK_MODE_MISMATCH");
  if(event.type!=="payment_paid")return normalized({eventId:event.id,type:event.type,paymentId:null,amount:null,currency:null,paid:false});
  const payment=event.data;if(payment?.status!=="paid")fail("INVALID_WEBHOOK");
  const currency=payment.currency;currencyDecimals(currency);
  return normalized({eventId:event.id,type:event.type,paymentId:id(payment.id),amount:minorAmount(payment.amount),currency,paid:true});
 }
 if(provider==="tap"){
  const payment=json(raw);if(!credentials.secret_key)fail("WEBHOOK_NOT_CONFIGURED");
  const currency=payment.currency,amount=majorToMinor(payment.amount,currency);
  const formatted=(amount/10**currencyDecimals(currency)).toFixed(currencyDecimals(currency));
  if(payment.object!=="charge")fail("UNSUPPORTED_WEBHOOK_EVENT");
  const text="x_id"+id(payment.id)+"x_amount"+formatted+"x_currency"+currency+"x_gateway_reference"+String(payment.reference?.gateway??"")+"x_payment_reference"+String(payment.reference?.payment??"")+"x_status"+String(payment.status??"")+"x_created"+String(payment.transaction?.created??"");
  const expected=createHmac("sha256",credentials.secret_key).update(text).digest("hex");
  if(!same(expected,headers.get("hashstring")))fail("INVALID_SIGNATURE");
  if(payment.live_mode!==(mode==="live"))fail("WEBHOOK_MODE_MISMATCH");
  return normalized({eventId:payment.id,type:"charge."+String(payment.status),paymentId:payment.id,amount,currency,paid:payment.status==="CAPTURED"});
 }
 if(provider==="hyperpay"){
  if(!/^[a-f0-9]{64}$/i.test(credentials.webhook_secret??""))fail("WEBHOOK_NOT_CONFIGURED");
  const iv=headers.get("x-initialization-vector")??"",tag=headers.get("x-authentication-tag")??"";
  if(!/^[a-f0-9]{24}$/i.test(iv)||!/^[a-f0-9]{32}$/i.test(tag))fail("INVALID_SIGNATURE");
  const encoded=raw.trim().startsWith("{")?json(raw).encryptedBody:raw.trim();
  if(typeof encoded!=="string"||!/^([a-f0-9]{2})+$/i.test(encoded))fail("INVALID_WEBHOOK");
  let decoded;try{const decipher=createDecipheriv("aes-256-gcm",Buffer.from(credentials.webhook_secret,"hex"),Buffer.from(iv,"hex"));decipher.setAuthTag(Buffer.from(tag,"hex"));decoded=Buffer.concat([decipher.update(Buffer.from(encoded,"hex")),decipher.final()]).toString("utf8");}catch{fail("INVALID_SIGNATURE");}
  const event=json(decoded),payment=event.payload;
  if(event.type!=="PAYMENT")return normalized({eventId:createHash("sha256").update(decoded).digest("hex"),type:String(event.type),paymentId:null,amount:null,currency:null,paid:false});
  if(!merchantReference||payment?.authentication?.entityId!==merchantReference)fail("WEBHOOK_ACCOUNT_MISMATCH");
  const currency=payment.currency,amount=majorToMinor(payment.amount,currency);
  const paid=["DB","CP"].includes(payment.paymentType)&&!payment.testMode&&!/^000\.100\.11[0-2]$/.test(String(payment.result?.code))&&/^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.1[12]0|000\.500\.)/.test(String(payment.result?.code));
  const eventId=createHash("sha256").update(JSON.stringify([id(payment.id),payment.paymentType,payment.result?.code,payment.timestamp])).digest("hex");
  return normalized({eventId,type:"PAYMENT."+String(payment.paymentType),paymentId:payment.id,amount,currency,paid});
 }
 fail("UNSUPPORTED_WEBHOOK_PROVIDER");
}
