import {NextResponse} from "next/server";
import type {RowDataPacket} from "mysql2/promise";
import {currentUserId} from "./session";
import {database} from "@/lib/db/mysql";
/** An operational employee account cannot become a customer through another URL.
 * Suspended employment must not turn the same account into a shopping account.
 */
export async function isEmployeeAccount(userId:string){
 const [rows]=await database().execute<RowDataPacket[]>("SELECT 1 FROM memberships WHERE user_id=? AND role<>'owner' LIMIT 1",[userId]);
 return rows.length>0;
}
export async function employeePersonalAccessDenied(){
 const user=await currentUserId();
 return user&&await isEmployeeAccount(user)?NextResponse.json({ok:false,code:"EMPLOYEE_OPERATIONAL_ACCESS_ONLY"},{status:403,headers:{"Cache-Control":"no-store"}}):null;
}
