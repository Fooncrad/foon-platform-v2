import test from "node:test";
import assert from "node:assert/strict";
import {financialReportRoles,canAccessFinancialReports} from "../lib/restaurant/report-access.ts";

test("financial reports allow only the approved tenant roles",()=>{
 assert.deepEqual(financialReportRoles,["owner","manager","cashier","accountant"]);
 for(const role of financialReportRoles)assert.equal(canAccessFinancialReports(role),true);
 for(const role of ["waiter","kitchen","driver","customer","creator","super_admin","unknown",""])assert.equal(canAccessFinancialReports(role),false);
});
