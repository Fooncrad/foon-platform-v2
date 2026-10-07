export type TenantContext={tenantId:string;branchId?:string};
export function requireTenantId(value:string|null|undefined):string{const id=value?.trim();if(!id)throw new Error("TENANT_CONTEXT_REQUIRED");return id;}
export function tenantWhere(ctx:TenantContext){return {tenantId:requireTenantId(ctx.tenantId)} as const;}
