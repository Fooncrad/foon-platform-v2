import {ResourceError} from "@/scripts/restaurant-resource-schema.mjs";
import type {PoolConnection,RowDataPacket} from "mysql2/promise";
import {tenantEntitlement} from "./entitlements";
/** Caller owns the transaction. Serialize every creation entry point per tenant. */
export async function assertCatalogCapacity(db:PoolConnection,tenant:string,restaurant:boolean,kind:"category"|"product",adding=1){
 await db.execute("SELECT tenant_id FROM tenant_subscriptions WHERE tenant_id=? FOR UPDATE",[tenant]);
 const grant=await tenantEntitlement(tenant,"digital_menu",db);
 if(!grant.enabled)throw new ResourceError("PLAN_FEATURE_REQUIRED");
 if(grant.limit===null)return;
 const table=restaurant?(kind==="category"?"restaurant_menu_categories":"restaurant_menu_items"):(kind==="category"?"catalog_categories":"catalog_products");
 const [[used]]=await db.execute<RowDataPacket[]>("SELECT COUNT(*) AS n FROM "+table+" WHERE tenant_id=?",[tenant]);
 if(Number(used.n)+adding>grant.limit)throw new ResourceError("PLAN_LIMIT_REACHED");
}
