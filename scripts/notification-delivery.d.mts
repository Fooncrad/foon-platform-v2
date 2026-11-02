import type {Pool,PoolConnection,Connection} from 'mysql2/promise';
type Database=Pick<Pool|PoolConnection|Connection,'execute'>;
type Provider={send:(message:{id:string;to:string;subject:string;text:string;html:string})=>Promise<unknown>;close:()=>void};
export function queuedMailProvider(db:Database,tenantId:string|null,env?:NodeJS.ProcessEnv):Promise<Provider>;
export function deliverNotifications(db:Database,options?:{providerFor?:(tenantId:string|null)=>Promise<Provider>;limit?:number}):Promise<{sent:number;retried:number;failed:number}>;
