import { randomUUID } from "node:crypto";
import {validStoreSlug} from "./store-slug.mjs";

/** Caller owns the transaction: no partial store or unassigned subscription. */
export async function provisionStore(db, { ownerId, name, slug, kind = "store", branchName = name }) {
  if(!validStoreSlug(slug))throw new Error("INVALID_SLUG");
  const [plans] = await db.execute("SELECT id FROM package_plans WHERE code='free' AND enabled=TRUE LIMIT 1 LOCK IN SHARE MODE");
  if (!plans.length) throw new Error("FREE_PLAN_UNAVAILABLE");
  const tenantId = randomUUID(), branchId = randomUUID();
  await db.execute("INSERT INTO tenants(id,slug,name,kind,status) VALUES (?,?,?,?,'active')", [tenantId, slug, name, kind]);
  await db.execute("INSERT INTO branches(id,tenant_id,name,slug,enabled) VALUES (?,?,?,'main',TRUE)", [branchId, tenantId, branchName]);
  await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'owner','active')", [randomUUID(), tenantId, ownerId]);
  await db.execute("INSERT INTO tenant_subscriptions(id,tenant_id,plan_id,status,starts_at,ends_at) VALUES (?,?,?,'active',NOW(),NULL)", [randomUUID(), tenantId, plans[0].id]);
  return { tenant: { id: tenantId, slug, name, kind, status: "active" }, branch: { id: branchId, name: branchName } };
}
