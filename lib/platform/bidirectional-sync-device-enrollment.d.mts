import type {PoolConnection} from "mysql2/promise";
export declare function enrollSyncDevice(args:{
 db:PoolConnection;
 authorizeAdmin:(session:unknown)=>Promise<{verifiedServerSide:true;tenantId:string;branchId:string;actorId:string}>;
 session:unknown;
 grants:unknown;
 expiresAt:string;
 deviceId?:string;
}):Promise<{deviceId:string;credential:string;expiresAt:string}>;
export declare function revokeSyncDevice(args:{
 db:PoolConnection;
 authorizeAdmin:(session:unknown)=>Promise<{verifiedServerSide:true;tenantId:string;branchId:string;actorId:string}>;
 session:unknown;
 deviceId:string;
}):Promise<{status:"revoked";deviceId:string}>;
