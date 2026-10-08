import test from "node:test";import assert from "node:assert/strict";
import {canResetAccountPassword,canAccessAllTenants} from "./admin-policy.mjs";
test("password resets protect the actor and other super admins",()=>{
 assert.equal(canResetAccountPassword("a","a",null,"long-password-123"),false);
 assert.equal(canResetAccountPassword("a","b","super_admin","long-password-123"),false);
 assert.equal(canResetAccountPassword("a","b","admin","long-password-123"),true);
 assert.equal(canResetAccountPassword("a","b",null,"short"),false);
 assert.equal(canResetAccountPassword("a","b",null,"ع".repeat(40)),false);
});
test("global tenant access is limited to an active super admin",()=>{
 assert.equal(canAccessAllTenants("super_admin",true),true);
 assert.equal(canAccessAllTenants("admin",true),false);
 assert.equal(canAccessAllTenants("super_admin",false),false);
});
