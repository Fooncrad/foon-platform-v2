import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";

const hash=(v:string)=>createHash("sha256").update(v).digest("hex");
export function clientIp(request:Request){return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";}
export async function loginAllowed(email:string,ip:string){
 const [rows]=await database().execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM auth_login_attempts WHERE succeeded=FALSE AND created_at>DATE_SUB(NOW(),INTERVAL 15 MINUTE) AND (email=? OR ip_hash=?)",[email,hash(ip)]);
 return Number(rows[0]?.n??0)<10;
}
export async function recordLogin(email:string,ip:string,succeeded:boolean){
 await database().execute("INSERT INTO auth_login_attempts(email,ip_hash,succeeded) VALUES (?,?,?)",[email,hash(ip),succeeded]);
}
