import {currentUserId} from "@/lib/auth/session";
import {database} from "@/lib/db/mysql";
import type {RowDataPacket} from "mysql2/promise";

/** A creator is an ordinary customer opting in: neither staff, store owner nor platform admin.
 * Historical employee memberships still disqualify the account after suspension.
 */
export async function customerCreatorUserId():Promise<string|null>{
 const userId=await currentUserId();
 if(!userId)return null;
 const [rows]=await database().execute<RowDataPacket[]>(
  "SELECT u.id FROM users u WHERE u.id=? AND u.status='active' "+
  "AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.user_id=u.id) "+
  "AND NOT EXISTS (SELECT 1 FROM platform_admins a WHERE a.user_id=u.id) LIMIT 1",
  [userId]);
 return rows.length?userId:null;
}
