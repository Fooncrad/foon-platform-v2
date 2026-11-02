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
   ON BINARY e.tenant_id=BINARY t.tenant_id AND BINARY e.branch_id=BINARY t.branch_id
   AND e.kind='employee' AND e.status='active' AND e.archived=FALSE
   AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.role'))='waiter'
   AND JSON_UNQUOTE(JSON_EXTRACT(e.data,'$.userId'))=?
  LEFT JOIN restaurant_resources s
   ON BINARY s.id=BINARY JSON_UNQUOTE(JSON_EXTRACT(t.data,'$.sectionId'))
   AND BINARY s.tenant_id=BINARY t.tenant_id AND BINARY s.branch_id=BINARY t.branch_id
   AND s.kind='dining_section' AND s.status='active' AND s.archived=FALSE
  WHERE t.tenant_id=? AND t.branch_id=? AND t.kind='dining_table'
   AND t.archived=FALSE
   AND BINARY COALESCE(
    NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(t.data,'$.waiterId')),''),'null'),
    JSON_UNQUOTE(JSON_EXTRACT(s.data,'$.waiterId'))
   ) = BINARY e.id
  ORDER BY t.id
 `,[userId,tenantId,branchId]);
 return rows.map(row=>String(row.id));
}
