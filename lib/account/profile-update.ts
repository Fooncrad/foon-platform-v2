import type {PoolConnection,RowDataPacket} from "mysql2/promise";

/** Change both account fields together or keep the previous persisted profile.
 * Caller owns the connection; never write a successful HTTP response pre-commit.
 */
export class InactiveAccountError extends Error{
 constructor(){super("ACCOUNT_NOT_ACTIVE");}
}
type ProfileConnection=Pick<PoolConnection,"beginTransaction"|"execute"|"commit"|"rollback">;
export async function saveAccountProfile(db:ProfileConnection,userId:string,name:string,phone:string|null){
 await db.beginTransaction();
 try{
  const [users]=await db.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? AND status='active' LIMIT 1 FOR UPDATE",[userId]);
  if(!users.length)throw new InactiveAccountError();
  await db.execute("UPDATE users SET display_name=? WHERE id=? AND status='active'",[name,userId]);
  await db.execute("INSERT INTO user_profiles(user_id,phone) VALUES (?,?) ON DUPLICATE KEY UPDATE phone=VALUES(phone)",[userId,phone]);
  await db.commit();
 }catch(error){
  try{await db.rollback();}catch{/* Preserve original failure; do not report a partial save. */}
  throw error;
 }
}
