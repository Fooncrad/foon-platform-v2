import type {PoolConnection} from "mysql2/promise";
export declare function validateInventoryMovement(change:unknown):{itemId:string;delta:number};
export declare function applyScopedInventoryMovement(db:PoolConnection,change:any):Promise<true>;
