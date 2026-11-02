export function isPrivatePrinterAddress(value:unknown):boolean;
export function claimPrintJob(request:Request,options:{pool:unknown;enabled?:boolean;leaseSeconds?:number}):Promise<Response>;
export function reportPrintJob(request:Request,options:{pool:unknown;jobId:string;enabled?:boolean}):Promise<Response>;
