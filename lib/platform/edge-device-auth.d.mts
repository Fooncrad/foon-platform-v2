import type {Pool,PoolConnection} from "mysql2/promise";
export type EdgeIdentity={deviceId:string;tenantId:string;branchId:string;actorUserId:string;role:string};
export function deviceTokenHash(token:string):string;
export function deviceReceiptKey(masterKey:string|undefined,deviceId:string):string;
export function authenticateEdgeDevice(connection:Pool|PoolConnection,authorization:string|null,lock?:boolean):Promise<EdgeIdentity>;
