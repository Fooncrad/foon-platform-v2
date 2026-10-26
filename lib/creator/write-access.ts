import type {PoolConnection,RowDataPacket} from "mysql2/promise";

/** Revalidate and lock the customer account inside the write transaction.
 * A session-level check alone can race with suspension or role conversion.
 */
export async function creatorWriteAccess(db:PoolConnection,userId:string):Promise<"active"|"inactive"|"disqualified">{
 const [users]=await db.execute<RowDataPacket[]>(
  "SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[userId]);
 if(!users.length)return "inactive";
 const [disqualified]=await db.execute<RowDataPacket[]>(
  "SELECT 1 FROM memberships WHERE user_id=? UNION ALL SELECT 1 FROM platform_admins WHERE user_id=? LIMIT 1",
  [userId,userId]);
 return disqualified.length?"disqualified":"active";
}
