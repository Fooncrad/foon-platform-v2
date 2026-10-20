import type {PoolConnection,RowDataPacket} from "mysql2/promise";

// Table-level assignment takes priority over the section-level fallback.
// Only an active waiter employee linked to the authenticated staff user and
// the requested tenant+branch can own a table. The caller also checks grants.
export async function assignedWaiterTableIds(
 db:Pick<PoolConnection,"execute">,tenantId:string,branchId:string,userId:string
):Promise<string[]>{
 if(!tenantId||!branchId||!userId)return [];
 const [rows]=await db.execute<RowDataPacket[]>(`
  SELECT DISTINCT t.id
  FROM restaurant_resources t
  JOIN restaurant_resources e
   ON e.tenant_id=t.tenant_id AND e.branch_id=t.branch_id
   AND e.kind='employee' AND e.status='active' AND e.archived=FALSE
   AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.role'))='waiter'
   AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))=?
  LEFT JOIN restaurant_resources s
   ON s.id=JSON_UNQUOTE(JSON_EXTRACT(t.data,'$.sectionId'))
   AND s.tenant_id=t.tenant_id AND s.branch_id=t.branch_id
   AND s.kind='dining_section' AND s.status='active' AND s.archived=FALSE
  WHERE t.tenant_id=? AND t.branch_id=? AND t.kind='dining_table'
   AND t.archived=FALSE
   AND COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.data,'$.waiterId')),''),'null'),
    JSON_UNQUOTE(JSON_EXTRACT(s.data,'$.waiterId'))
   )=e.id
  ORDER BY t.id
 `,[userId,tenantId,branchId]);
 return rows.map(row=>String(row.id));
}
