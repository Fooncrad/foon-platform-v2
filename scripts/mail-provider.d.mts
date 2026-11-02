export function mailConfiguration(env?:NodeJS.ProcessEnv): {user:string;from:string;name:string;configured:boolean;options:unknown};
export function createMailProvider(env?:NodeJS.ProcessEnv):Promise<{configuration:{from:string;name:string};verify:()=>Promise<unknown>;send:(message:{id:string;to:string;subject:string;text:string;html:string})=>Promise<{accepted:boolean}>;close:()=>void}>;
