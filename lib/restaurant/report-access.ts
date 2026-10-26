import type {TenantRole} from "@/lib/auth/roles";

// Financial reports contain sales totals and product revenue. Non-financial
// staff must not see them even if a legacy permission grant includes reports.view.
export const financialReportRoles:readonly TenantRole[]=["owner","manager","cashier","accountant"];

export function canAccessFinancialReports(role:TenantRole):boolean{
 return financialReportRoles.includes(role);
}
