export declare const ACCOUNT_HELP_CODES:Set<string>;
export declare function accountHelpCode(code:unknown):string;
export declare function publicLoginOrigin(configured:string|undefined,requestUrl:string,production?:boolean):string;
export declare function accountHelpUrl(configured:string|undefined,requestUrl:string,code:unknown,production?:boolean):string;
