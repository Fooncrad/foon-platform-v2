import type {PoolConnection} from "mysql2/promise";
export declare function handleAuthenticatedSyncPull(args:{
 connection:PoolConnection;
 authenticateDevice:(credential:string)=>Promise<{
 authenticated:true;deviceId:string;tenantId:string;branchId:string;actorId:string;
 grants:string[];enabled:boolean;revoked:boolean;suspended:boolean;expiresAt:string
 }>;
 credential:string;request:{tenantId:string;branchId:string;after:number;limit:number};
 privateKey:string;
}):Promise<{ok:true;signature:string;events:unknown[];nextCursor:number;tenantId:string;branchId:string}>;
export declare function handleAuthenticatedSyncPush(args:{
 connection:PoolConnection;
 authenticateDevice:(credential:string)=>Promise<{
 authenticated:true;deviceId:string;tenantId:string;branchId:string;actorId:string;
 grants:string[];enabled:boolean;revoked:boolean;suspended:boolean;expiresAt:string
 }>;
 credential:string;change:unknown;
 applyBusinessChange:(db:PoolConnection,change:any)=>Promise<boolean>;
 privateKey:string;
}):Promise<{ok:boolean;receipt?:unknown;status?:string;reason?:string}>;
