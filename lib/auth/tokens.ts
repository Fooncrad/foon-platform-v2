import { createHash, randomBytes, randomUUID } from "node:crypto";
import { database } from "@/lib/db/mysql";

const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
export async function issueToken(kind:"email_verification_tokens"|"password_reset_tokens",userId:string,minutes:number){
 const token=randomBytes(32).toString("base64url");
 const expires=new Date(Date.now()+minutes*60_000);
 await database().execute(`INSERT INTO ${kind}(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)`,[randomUUID(),userId,digest(token),expires]);
 return token;
}
export async function consumeToken(kind:"email_verification_tokens"|"password_reset_tokens",token:string){
 const db=database(); const hash=digest(token);
 const [result]=await db.execute(`UPDATE ${kind} SET used_at=NOW() WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW()`,[hash]);
 return (result as {affectedRows?:number}).affectedRows===1;
}
