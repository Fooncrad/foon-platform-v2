import type {PoolConnection,RowDataPacket} from "mysql2/promise";

/** Revalidate the customer identity under the write transaction's user-row lock. */
export async function creatorWriteAccess(db:Pick<PoolConnection,"execute">,userId:string):Promise<"active"|"inactive"|"disqualified">{
 const [users]=await db.execute<RowDataPacket[]>(
  "SELECT id FROM users WHERE id=? AND status='active' FOR UPDATE",[userId]);
 if(!users.length)return "inactive";
 const [disqualified]=await db.execute<RowDataPacket[]>(
  "SELECT 1 FROM memberships WHERE user_id=? UNION ALL SELECT 1 FROM platform_admins WHERE user_id=? LIMIT 1",
  [userId,userId]);
 return disqualified.length?"disqualified":"active";
}
