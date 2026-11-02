import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {accountHelpCode,accountHelpUrl,publicLoginOrigin} from "../lib/auth/public-login-url.mjs";
import {restrictedMembershipReason} from "../lib/auth/account-login-policy.ts";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("OAuth error redirects never expose an internal 0.0.0.0 Hostinger origin",()=>{
 assert.equal(accountHelpUrl("https://nfoodz.com","http://0.0.0.0:3000/api/auth/google/callback","GOOGLE_ACCOUNT_DISABLED",true),"https://nfoodz.com/account-status?code=GOOGLE_ACCOUNT_DISABLED");
 assert.equal(accountHelpUrl("http://0.0.0.0:3000","http://0.0.0.0:3000/api/auth/google/callback","GOOGLE_ACCOUNT_DISABLED",true),"https://nfoodz.com/account-status?code=GOOGLE_ACCOUNT_DISABLED");
 assert.equal(publicLoginOrigin("https://preview.hostingersite.com","http://0.0.0.0:3000/",true),"https://preview.hostingersite.com");
 assert.equal(publicLoginOrigin(undefined,"http://0.0.0.0:3000/",false),"http://localhost:3000");
 assert.equal(accountHelpCode("../../evil"),"LOGIN_UNAVAILABLE");
});
test("staff membership denies inactive employer access without silently granting customer role",()=>{
 assert.equal(restrictedMembershipReason([{role:"waiter",membership_status:"suspended",tenant_status:"active"}]),"STAFF_ACCESS_SUSPENDED");
 assert.equal(restrictedMembershipReason([{role:"cashier",membership_status:"invited",tenant_status:"active"}]),"STAFF_ACCESS_PENDING");
 assert.equal(restrictedMembershipReason([{role:"waiter",membership_status:"active",tenant_status:"suspended"}]),"BUSINESS_SUSPENDED");
 assert.equal(restrictedMembershipReason([{role:"owner",membership_status:"active",tenant_status:"pending"}]),"BUSINESS_PENDING");
 assert.equal(restrictedMembershipReason([{role:"waiter",membership_status:"active",tenant_status:"active"}]),null);
 assert.equal(restrictedMembershipReason([]),null);
});
test("account guidance covers three languages, staff instructions and no account data",()=>{
 const page=read("app/account-status/page.tsx");
 for(const value of ["ACCOUNT_SUSPENDED","STAFF_ACCESS_SUSPENDED","STAFF_ACCESS_PENDING","STAFF_ACCOUNT_HELP","BUSINESS_SUSPENDED","GOOGLE_ACCOUNT_DISABLED","ACCOUNT_REJECTED"])assert.match(page,new RegExp(value));
 for(const l of ["ar","en","fr"])assert.match(page,new RegExp(l+":\\{"));
 assert.match(page,/robots:\{index:false,follow:false\}/);
 assert.doesNotMatch(page,/SELECT |database\(/);
 const cb=read("app/api/auth/google/callback/route.ts");
 assert.match(cb,/accountHelpUrl\(/);
 assert.doesNotMatch(cb,/NextResponse.redirect\(new URL\("\/login\?error="/);
 const login=read("app/api/auth/login/route.ts");
 assert.match(login,/accountMembershipRestriction/);
 assert.match(login,/verifyPassword/);
});
