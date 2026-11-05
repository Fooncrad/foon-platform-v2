import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";

const secret=()=>process.env.FOON_DISPLAY_REALTIME_SECRET??"";
const endpoint=()=>process.env.FOON_DISPLAY_REALTIME_HTTP_URL??"";

export function createDisplayRealtimeTicket(input:{screenId:string;tenantId:string},now=Date.now()){
 const key=secret();
 if(key.length<32)throw new Error("DISPLAY_REALTIME_NOT_CONFIGURED");
 const payload=Buffer.from(JSON.stringify({v:1,sub:input.screenId,tenant:input.tenantId,exp:Math.floor(now/1000)+60,nonce:randomBytes(12).toString("base64url")})).toString("base64url");
 const signature=createHmac("sha256",key).update(payload).digest("base64url");
 return payload+"."+signature;
}

export function verifyDisplayRealtimeTicket(ticket:string,now=Date.now()){
 const key=secret();
 if(key.length<32||ticket.length>2048)return null;
 const [payload,signature,...extra]=ticket.split(".");
 if(extra.length||!payload||!signature)return null;
 const expected=createHmac("sha256",key).update(payload).digest();
 let actual:Buffer;try{actual=Buffer.from(signature,"base64url");}catch{return null;}
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 try{
  const value=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  if(value.v!==1||typeof value.sub!=="string"||typeof value.tenant!=="string"||!Number.isInteger(value.exp)||value.exp<=Math.floor(now/1000))return null;
  return {screenId:value.sub as string,tenantId:value.tenant as string,expiresAt:value.exp as number};
 }catch{return null;}
}

export async function publishDisplayInvalidation(tenantId:string,screenId:string){
 const base=endpoint(),key=secret();
 if(!base||key.length<32)return false;
 try{
  const parsed=new URL(base);
  if(parsed.protocol!=="https:")return false;
  const response=await fetch(new URL("/publish",parsed),{
   method:"POST",
   headers:{"content-type":"application/json","authorization":"Bearer "+key},
   body:JSON.stringify({type:"display.invalidate",tenantId,screenId,occurredAt:new Date().toISOString()}),
   signal:AbortSignal.timeout(2500),
   cache:"no-store"
  });
  return response.ok;
 }catch{return false;}
}
