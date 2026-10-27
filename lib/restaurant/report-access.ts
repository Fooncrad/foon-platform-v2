import type {TenantRole} from "@/lib/auth/roles";
export const financialReportRoles:TenantRole[]=["owner","manager","cashier","accountant"];
export function canAccessFinancialReports(role:TenantRole):boolean{return financialReportRoles.includes(role);}
