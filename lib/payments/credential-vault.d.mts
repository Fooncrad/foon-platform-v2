export type VaultContext={tenantId:string;scope:string;provider:string;mode:'test'|'live'};
export function paymentVaultReady():boolean;
export function encryptPaymentCredentials(credentials:Record<string,string>,context:VaultContext,keyValue?:string):string;
export function decryptPaymentCredentials(envelope:string,context:VaultContext,keyValue?:string):Record<string,string>;
