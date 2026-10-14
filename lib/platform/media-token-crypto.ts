import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";

/** Separate encryption key for social OAuth tokens. Never log key or plaintext. */
function mediaTokenKey():Buffer {
 const value=process.env.FOON_MEDIA_TOKEN_ENCRYPTION_KEY;
 if(!value||!(/^[a-fA-F0-9]{64}$/.test(value)))throw new Error("MEDIA_TOKEN_ENCRYPTION_KEY_MISSING");
 return Buffer.from(value,"hex");
}

/** AES-256-GCM with per-token IV and tenant/provider/account authenticated binding. */
export function encryptMediaToken(token:string,tenantId:string,provider:string,accountId:string):string {
 if(!token||token.length>65536)throw new Error("INVALID_MEDIA_TOKEN");
 const aad=mediaTokenContext(tenantId,provider,accountId);
 const iv=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",mediaTokenKey(),iv);
 cipher.setAAD(Buffer.from(aad));
 const encrypted=Buffer.concat([cipher.update(token,"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}

export function decryptMediaToken(payload:string,tenantId:string,provider:string,accountId:string):string {
 const parts=payload.split(".");
 if(parts.length!==4||parts[0]!=="v1")throw new Error("INVALID_MEDIA_TOKEN_ENVELOPE");
 const [,ivPart,tagPart,dataPart]=parts;
 const iv=Buffer.from(ivPart,"base64url"),tag=Buffer.from(tagPart,"base64url");
 if(iv.length!==12||tag.length!==16||!dataPart)throw new Error("INVALID_MEDIA_TOKEN_ENVELOPE");
 const decipher=createDecipheriv("aes-256-gcm",mediaTokenKey(),iv);
 decipher.setAAD(Buffer.from(mediaTokenContext(tenantId,provider,accountId)));
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(Buffer.from(dataPart,"base64url")),decipher.final()]).toString("utf8");
}

function mediaTokenContext(tenantId:string,provider:string,accountId:string) {
 for(const value of [tenantId,provider,accountId]) {
  if(!value||value.length>190||!(/^[a-zA-Z0-9_:.@-]+$/.test(value)))throw new Error("INVALID_MEDIA_TOKEN_CONTEXT");
 }
 return JSON.stringify(["foon-media-oauth-v1",tenantId,provider,accountId]);
}
