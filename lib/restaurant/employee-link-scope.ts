import type {Pool,PoolConnection,RowDataPacket} from "mysql2/promise";

// The employee record is not authoritative by itself: its userId is JSON
// managed in the tenant's team resource. Always resolve it through an active
// staff membership AND enabled assignment for the exact branch and role.
export function employeeMembershipRole(role:unknown):string|null{
 if(role==="supervisor")return "waiter"; // Existing supervisor login role.
 return typeof role==="string"&&["cashier","waiter","kitchen","driver","accountant"].includes(role)?role:null;
}

export async function resolveBoundEmployeeUser(
 db:Pool|PoolConnection,tenantId:string,branchId:unknown,data:Record<string,unknown>
):Promise<string>{
 const userId=typeof data.userId==="string"?data.userId:"";
 const role=employeeMembershipRole(data.role);
 if(!/^[a-f0-9-]{36}$/i.test(tenantId)||!/^[a-f0-9-]{36}$/i.test(userId)||
 typeof branchId!=="string"||!/^[a-f0-9-]{36}$/i.test(branchId)||!role)return "";
 const [rows]=await db.execute<RowDataPacket[]>(`
  SELECT m.user_id
  FROM memberships m
  JOIN employee_branch_assignments a
   ON BINARY a.tenant_id=BINARY m.tenant_id
   AND BINARY a.user_id=BINARY m.user_id
   AND BINARY a.branch_id=BINARY ?
   AND a.enabled=TRUE
   AND a.role COLLATE utf8mb4_unicode_ci=m.role COLLATE utf8mb4_unicode_ci
  JOIN users u ON BINARY u.id=BINARY m.user_id AND u.status='active'
  WHERE BINARY m.tenant_id=BINARY ?
   AND BINARY m.user_id=BINARY ?
   AND m.role COLLATE utf8mb4_unicode_ci=? COLLATE utf8mb4_unicode_ci
   AND m.status='active'
   AND NOT EXISTS (
    SELECT 1 FROM memberships customer
    WHERE BINARY customer.user_id=BINARY m.user_id
     AND customer.role COLLATE utf8mb4_unicode_ci='customer'
     AND customer.status='active'
   )
   AND NOT EXISTS (
    SELECT 1 FROM tenant_customers tc WHERE BINARY tc.user_id=BINARY m.user_id
   )
   AND NOT EXISTS (
    SELECT 1 FROM platform_admins pa WHERE BINARY pa.user_id=BINARY m.user_id
   )
  LIMIT 2
 `,[branchId,tenantId,userId,role]);
 return rows.length===1?userId:"";
}
