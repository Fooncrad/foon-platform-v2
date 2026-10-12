import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {createMailProvider} from "@/scripts/mail-provider.mjs";

function key(){
 const raw=process.env.FOON_MAIL_ENCRYPTION_KEY;
 if(!raw||!/^[a-f0-9]{64}$/i.test(raw))throw Error("MAIL_ENCRYPTION_KEY_NOT_CONFIGURED");
 return Buffer.from(raw,"hex");
}
export function encryptSmtpPassword(value:string){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
 const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
 return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString("base64")).join(".");
}
function decryptSmtpPassword(value:string){
 const parts=value.split(".");if(parts.length!==3)throw Error("MAIL_SECRET_INVALID");
 const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(parts[0],"base64"));
 decipher.setAuthTag(Buffer.from(parts[1],"base64"));
 return Buffer.concat([decipher.update(Buffer.from(parts[2],"base64")),decipher.final()]).toString("utf8");
}
export async function tenantMailSettings(tenantId:string){
 const [rows]=await database().execute<RowDataPacket[]>("SELECT mode,smtp_host,smtp_port,smtp_user,smtp_from,smtp_from_name,smtp_secret FROM tenant_mail_settings WHERE tenant_id=? LIMIT 1",[tenantId]);
 return rows[0]??null;
}
export async function createTenantMailProvider(tenantId:string){
 const settings=await tenantMailSettings(tenantId);
 if(!settings||settings.mode!=="custom")return createMailProvider();
 if(!settings.smtp_secret)throw Error("TENANT_SMTP_PASSWORD_REQUIRED");
 const password=decryptSmtpPassword(String(settings.smtp_secret));
 const env={...process.env,SMTP_HOST:String(settings.smtp_host),SMTP_USER:String(settings.smtp_user),SMTP_FROM:String(settings.smtp_from),SMTP_FROM_NAME:String(settings.smtp_from_name||"FOON"),SMTP_PASSWORD:password};
 return createMailProvider(env);
}
