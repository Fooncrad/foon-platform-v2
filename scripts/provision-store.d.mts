import type { PoolConnection } from "mysql2/promise";
export function provisionStore(db: PoolConnection, input: { ownerId: string; name: string; slug: string; kind?: "store" | "restaurant"; branchName?: string }): Promise<{tenant:{id:string;slug:string;name:string;kind:string;status:string};branch:{id:string;name:string}}>;
