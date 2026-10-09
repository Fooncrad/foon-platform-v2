export type ResourceField={key:string;label:string;type:string;required?:boolean;min?:number;max?:number;integer?:boolean;maxLength?:number;options?:string[];ref?:string};
export type ResourceModule={kind:string;label:string;feature?:string;roles:string[];statuses:string[];fields:ResourceField[];singleton?:boolean};
export const resourceModules:Record<string,ResourceModule>;
export const fieldLabels:Record<string,string>;
export class ResourceError extends Error{code:string;constructor(code:string);}
export function validateResource(module:string,body:unknown):{name:string;status:string;data:Record<string,string|number|null>;branchId:string|null};
