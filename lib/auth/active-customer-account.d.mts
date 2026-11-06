import type {Pool, PoolConnection} from 'mysql2/promise';
export function activeCustomerAccount(db: Pool | PoolConnection, userId: string, lock?: boolean): Promise<boolean>;
