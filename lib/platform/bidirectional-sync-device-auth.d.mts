import type {PoolConnection} from "mysql2/promise";
export declare function authenticateEnrolledSyncDevice(db:PoolConnection,credential:string):Promise<{
 authenticated:true;deviceId:string;tenantId:string;branchId:string;actorId:string;grants:string[];
 enabled:boolean;revoked:boolean;suspended:boolean;expiresAt:string
}>;