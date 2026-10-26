import type {PoolConnection,RowDataPacket} from "mysql2/promise";

// A driver employee resource alone is not an authorization source. Both POS
// assignment and completion must resolve the same active, branch-scoped staff
// identity, with no customer or platform-admin identity attached to that user.
const activeDriverScope=`
 FROM restaurant_resources e
 JOIN memberships m
  ON m.tenant_id=e.tenant_id
  AND m.user_id=JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))
  AND m.role='driver' AND m.status='active'
 JOIN employee_branch_assignments a
  ON a.tenant_id=e.tenant_id AND a.user_id=m.user_id
  AND a.branch_id=? AND a.enabled=TRUE
  AND a.role COLLATE utf8mb4_unicode_ci=m.role COLLATE utf8mb4_unicode_ci
 JOIN users u ON u.id=m.user_id AND u.status='active'
 WHERE e.tenant_id=? AND e.branch_id=?
  AND e.kind='employee' AND e.archived=FALSE AND e.status='active'
  AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.role'))='driver'
  AND NOT EXISTS (
   SELECT 1 FROM memberships customer
   WHERE customer.user_id=m.user_id AND customer.role='customer' AND customer.status='active'
  )
  AND NOT EXISTS (SELECT 1 FROM tenant_customers tc WHERE tc.user_id=m.user_id)
  AND NOT EXISTS (SELECT 1 FROM platform_admins pa WHERE pa.user_id=m.user_id)
`;

export async function activeDeliveryDriverIds(
 db:Pick<PoolConnection,"execute">,tenantId:string,branchId:string
):Promise<string[]>{
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT e.id"+activeDriverScope+" ORDER BY e.id FOR UPDATE",
  [branchId,tenantId,branchId]
 );
 return rows.map(row=>String(row.id));
}

export async function assignedActiveDeliveryDriver(
 db:Pick<PoolConnection,"execute">,tenantId:string,branchId:string,userId:string,employeeId:string
):Promise<boolean>{
 if(!userId||!employeeId)return false;
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT e.id"+activeDriverScope+
  " AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))=? AND e.id=? LIMIT 1 FOR UPDATE",
  [branchId,tenantId,branchId,userId,employeeId]
 );
 return rows.length===1;
}


export async function activeDeliveryDriverEmployeeId(
 db:Pick<PoolConnection,"execute">,tenantId:string,branchId:string,userId:string
):Promise<string|null>{
 if(!userId)return null;
 const [rows]=await db.execute<RowDataPacket[]>(
  "SELECT e.id"+activeDriverScope+
  " AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))=? LIMIT 2",
  [branchId,tenantId,branchId,userId]
 );
 return rows.length===1?String(rows[0].id):null;
}
