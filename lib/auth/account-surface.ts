import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "./session";
import {database} from "@/lib/db/mysql";
/** Operational staff and platform administrators cannot use customer surfaces.
 * Disabled employment or administrator records must not turn into customer access.
 * Owners retain the existing personal customer-account behavior.
 */
export async function isEmployeeAccount(userId:string){
 const [rows]=await database().execute<RowDataPacket[]>("SELECT (EXISTS(SELECT 1 FROM memberships WHERE user_id=? AND role<>'owner') OR EXISTS(SELECT 1 FROM platform_admins WHERE user_id=?)) AS blocked",[userId,userId]);
 return Number(rows[0]?.blocked)===1;
}
export async function employeePersonalAccessDenied(){
 const user=await currentUserId();
 return user&&await isEmployeeAccount(user)?NextResponse.json({ok:false,code:"EMPLOYEE_OPERATIONAL_ACCESS_ONLY"},{status:403,headers:{"Cache-Control":"no-store"}}):null;
}
