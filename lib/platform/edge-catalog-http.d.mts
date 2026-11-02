import type {Pool} from "mysql2/promise";
export function readEdgeCatalog(request:Request,options:{pool:Pool;enabled?:boolean}):Promise<Response>;
