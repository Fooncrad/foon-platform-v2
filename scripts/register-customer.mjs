import {validStoreSlug} from "./store-slug.mjs";
/** Customer identity never grants store workspace access or provisions a store. */
export async function registerCustomer(db, { id, email, passwordHash, name, storeSlug }) {
  if(!validStoreSlug(storeSlug))throw new Error("STORE_NOT_FOUND");
  const [stores] = await db.execute("SELECT id FROM tenants WHERE slug=? AND status='active' LIMIT 1 LOCK IN SHARE MODE", [storeSlug]);
  if (!stores.length) throw new Error("STORE_NOT_FOUND");
  await db.execute("INSERT INTO users(id,email,password_hash,display_name,status) VALUES (?,?,?,?,'active')", [id, email, passwordHash, name || null]);
  await db.execute("INSERT INTO tenant_customers(tenant_id,user_id) VALUES (?,?)", [stores[0].id, id]);
  await db.execute("INSERT INTO customer_origins(user_id,tenant_id) VALUES (?,?)", [id, stores[0].id]);
  return { tenantId: String(stores[0].id) };
}
