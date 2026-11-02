import type {Pool} from "mysql2/promise";
export function receiveEdgeRequest(request:Request,options:{pool:Pool;masterKey?:string;plainTakeawayEnabled?:boolean}):Promise<Response>;
