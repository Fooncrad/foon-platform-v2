import type {Pool,PoolConnection,RowDataPacket} from "mysql2/promise";

type MembershipRow=RowDataPacket&{role:string;membership_status:string;tenant_status:string};
/** A deactivated employee must never be allowed to fall through to customer access.
 * No store name, employer ID, or personal information is returned to the browser.
 */
export function restrictedMembershipReason(rows:ReadonlyArray<{role:string;membership_status:string;tenant_status:string}>):string|null{
 if(!rows.length)return null;
 if(rows.some(row=>row.membership_status==="active"&&row.tenant_status==="active"))return null;
 if(rows.some(row=>row.tenant_status==="suspended"&&row.membership_status==="active"))return "BUSINESS_SUSPENDED";
 if(rows.some(row=>row.tenant_status==="pending"&&row.membership_status==="active"))return "BUSINESS_PENDING";
 const staff=rows.some(row=>row.role!=="owner");
 if(rows.some(row=>row.membership_status==="suspended"))return staff?"STAFF_ACCESS_SUSPENDED":"BUSINESS_SUSPENDED";
 if(rows.some(row=>row.membership_status==="invited"))return staff?"STAFF_ACCESS_PENDING":"BUSINESS_PENDING";
 return staff?"STAFF_ACCESS_SUSPENDED":"BUSINESS_SUSPENDED";
}
export async function accountMembershipRestriction(db:Pool|PoolConnection,userId:string):Promise<string|null>{
 const [rows]=await db.execute<MembershipRow[]>(
  "SELECT m.role,m.status AS membership_status,t.status AS tenant_status FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=?",
  [userId]);
 return restrictedMembershipReason(rows);
}
