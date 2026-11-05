import {createHmac,randomBytes,scryptSync,timingSafeEqual} from "node:crypto";

const PIN_PATTERN = /^\\d{4,8}$/;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function createKioskPinRecord(pin:string) {
 if(!PIN_PATTERN.test(pin)) throw new Error("INVALID_KIOSK_PIN");
 const salt=randomBytes(16).toString("hex");
 const hash=scryptSync(pin,salt,64).toString("hex");
 return {salt,hash};
}

export function verifyKioskPin(pin:string,salt:string,expectedHash:string) {
 if(!PIN_PATTERN.test(pin)||!/^[a-f0-9]{32}$/i.test(salt)||!/^[a-f0-9]{128}$/i.test(expectedHash)) return false;
 const actual=scryptSync(pin,salt,64);
 const expected=Buffer.from(expectedHash,"hex");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export function createKioskSession(token:string,pinHash:string,now=Date.now()) {
 const expiresAt=now+SESSION_TTL_MS;
 const payload=expiresAt+"."+randomBytes(16).toString("hex");
 const signature=createHmac("sha256",pinHash).update(token+"."+payload).digest("hex");
 return {value:payload+"."+signature,maxAge:Math.floor(SESSION_TTL_MS/1000)};
}

export function verifyKioskSession(token:string,pinHash:string,value:string|undefined,now=Date.now()) {
 if(!value)return false;
 const [expiresText,nonce,signature,...extra]=value.split(".");
 if(extra.length||!/^\\d{13}$/.test(expiresText)||!/^[a-f0-9]{32}$/i.test(nonce)||!/^[a-f0-9]{64}$/i.test(signature))return false;
 const expiresAt=Number(expiresText);
 if(!Number.isSafeInteger(expiresAt)||expiresAt<=now||expiresAt>now+SESSION_TTL_MS+60_000)return false;
 const expected=createHmac("sha256",pinHash).update(token+"."+expiresText+"."+nonce).digest();
 const actual=Buffer.from(signature,"hex");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}

export function readCookie(request:Request,name:string) {
 const header=request.headers.get("cookie")??"";
 for(const part of header.split(";")) {
  const index=part.indexOf("=");
  if(index<0||part.slice(0,index).trim()!==name)continue;
  try{return decodeURIComponent(part.slice(index+1).trim());}catch{return undefined;}
 }
 return undefined;
}
