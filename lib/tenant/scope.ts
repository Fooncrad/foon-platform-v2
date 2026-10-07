import type { PoolConnection, RowDataPacket } from "mysql2/promise";

export type TenantId = string & { readonly __tenant: unique symbol };
export function tenantId(value: string | null | undefined): TenantId {
  const id=value?.trim();
  if (!id || id.length > 36) throw new Error("TENANT_CONTEXT_REQUIRED");
  return id as TenantId;
}
export async function assertTenantExists(db: PoolConnection, id: TenantId) {
  const [rows]=await db.execute<RowDataPacket[]>("SELECT id FROM tenants WHERE id=? AND status='active' LIMIT 1",[id]);
  if (!rows.length) throw new Error("TENANT_NOT_FOUND");
}
