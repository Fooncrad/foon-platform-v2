import type { PoolConnection } from "mysql2/promise";
export function registerCustomer(db: PoolConnection, input: {id:string;email:string;passwordHash:string;name:string;storeSlug:string}): Promise<{tenantId:string}>;
