import type {PoolConnection} from 'mysql2/promise';
export function desktopSyncStates(connection:PoolConnection,tenantId:string,orderIds:string[]):Promise<Map<string,string>>;
export function queueDesktopOrderEvent(connection:PoolConnection, context:{tenantId:string;actorUserId:string;orderId:string;kind:'created'|'status';expectedStatus?:string;requestedPayment?:unknown}):Promise<void>;
