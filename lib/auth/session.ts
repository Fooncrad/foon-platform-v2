import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/db/mysql";

const COOKIE="foon_session";
const SESSION_SECONDS=60*60*24*30;
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");

export async function createSession(userId:string, connection?:PoolConnection){
  const token=randomBytes(32).toString("base64url");
  const expires=new Date(Date.now()+SESSION_SECONDS*1000);
  await (connection??database()).execute(
    "INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,?)",
    [randomUUID(),userId,digest(token),expires]
  );
  const jar=await cookies();
  jar.set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:SESSION_SECONDS});
}
export async function currentUserId(){
  const token=(await cookies()).get(COOKIE)?.value;
  if(!token) return null;
  const [rows]=await database().execute<RowDataPacket[]>(
    "SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at>NOW() LIMIT 1",[digest(token)]
  );
  return (rows[0]?.user_id as string|undefined)??null;
}
export async function destroySession(){
  const jar=await cookies(); const token=jar.get(COOKIE)?.value;
  if(token) await database().execute("DELETE FROM auth_sessions WHERE token_hash=?",[digest(token)]);
  jar.delete(COOKIE);
}

/** Admin-only inactivity timeout; ordinary customer sessions remain unchanged. */
export async function currentActiveAdminUserId(){
  const token=(await cookies()).get(COOKIE)?.value;
  if(!token)return null;
  const hash=digest(token);
  const [rows]=await database().execute<RowDataPacket[]>(
    "SELECT user_id FROM auth_sessions WHERE token_hash=? AND expires_at>NOW() AND last_seen_at>DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1",
    [hash]
  );
  const userId=rows[0]?.user_id as string|undefined;
  if(!userId)return null;
  const [update]=await database().execute<ResultSetHeader>(
    "UPDATE auth_sessions SET last_seen_at=NOW() WHERE token_hash=? AND expires_at>NOW() AND last_seen_at>DATE_SUB(NOW(), INTERVAL 5 MINUTE)",
    [hash]
  );
  if(update.affectedRows!==1)return null;
  return userId;
}
