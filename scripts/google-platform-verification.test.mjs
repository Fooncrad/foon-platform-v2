import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("Google credentials and enable switch are platform-only, never tenant-editable",()=>{
 const api=read("app/api/admin/integrations/route.ts");
 const ui=read("app/admin/settings/integration-settings.tsx");
 const start=read("app/api/auth/google/start/route.ts");
 const callback=read("app/api/auth/google/callback/route.ts");
 assert.match(api,/currentActiveAdminUserId\(\)/);
 assert.match(api,/requirePlatformRole\(user,write\?\["super_admin","admin"\]/);
 assert.match(api,/assertSameOrigin\(request\)/);
 assert.match(api,/google_oauth_enabled/);
 assert.match(api,/typeof b\.googleOauthEnabled!=="boolean"/);
 assert.match(ui,/googleOauthEnabled/);
 assert.match(ui,/googleClientSecretPresent/);
 assert.doesNotMatch(api,/googleClientSecret:process\.env\.GOOGLE_CLIENT_SECRET/);
 assert.doesNotMatch(ui,/<input[^>]*value=\{[^}]*googleClientSecret/);
 assert.match(start,/config_key='google_oauth_enabled'/);
 assert.match(callback,/config_key='google_oauth_enabled'/);
 assert.match(callback,/GOOGLE_DISABLED/);
});

test("first customer purchase and service requests require verified email at the server",()=>{
 for(const path of ["app/api/customer/orders/route.ts","app/api/customer/service-requests/route.ts","app/api/customer/services/route.ts"]){
  const source=read(path);
  assert.match(source,/email_verified_at/);
  assert.match(source,/EMAIL_VERIFICATION_REQUIRED/);
  assert.ok(source.indexOf("EMAIL_VERIFICATION_REQUIRED")<source.indexOf(path.endsWith("/orders/route.ts")?"await createOrder":path.endsWith("/service-requests/route.ts")?"const id=randomUUID()":"await saveResource"),"verification must precede persistence: "+path);
 }
 const reservation=read("app/api/customer/services/route.ts");
 assert.match(reservation,/body\.action==="reservation"&&!users\[0\]\.email_verified_at/);
});

test("password registration and login report email verification and retain same account",()=>{
 const login=read("app/api/auth/login/route.ts");
 const register=read("app/api/customer/register/route.ts");
 const browser=read("app/login/page.tsx");
 assert.match(login,/WHERE email=\? LIMIT 1/);
 assert.match(login,/emailVerificationRequired:!user\.email_verified_at/);
 assert.match(register,/emailVerificationRequired:true/);
 assert.match(browser,/router\.replace\("\/verify-email"\)/);
});

test("checkout interfaces offer localized verification link without discarding carts",()=>{
 for(const path of ["app/[slug]/storefront-cart.tsx","app/[slug]/public-menu.tsx","app/[slug]/service-request-action.tsx","app/[slug]/menu-services.tsx"]){
  const source=read(path);
  assert.match(source,/EMAIL_VERIFICATION_REQUIRED/);
  assert.match(source,/href="\/verify-email"/);
 }
});

test("menu and commerce checkout keep visible auth and verification actions beside order buttons",()=>{
 const inline=read("app/[slug]/inline-customer-auth.tsx");
 const menu=read("app/[slug]/public-menu.tsx");
 const cart=read("app/[slug]/storefront-cart.tsx");
 const googleStart=read("app/api/auth/google/start/route.ts");
 const googleCallback=read("app/api/auth/google/callback/route.ts");
 const availability=read("app/api/auth/google/availability/route.ts");
 assert.match(inline,/api\/auth\/google\/availability/);
 assert.match(inline,/api\/auth\/google\/start\?store=/);
 assert.match(inline,/onVerificationRequired/);
 assert.match(menu,/publicMenuCheckoutNotice/);
 assert.match(cart,/foonCheckoutNotice/);
 assert.match(menu,/foon-menu-cart:/);
 assert.match(menu,/checkout=google/);
 assert.match(cart,/checkout=google/);
 assert.match(menu,/EMAIL_VERIFICATION_REQUIRED/);
 assert.match(cart,/EMAIL_VERIFICATION_REQUIRED/);
 assert.match(googleStart,/\^\[a-z0-9\]/);
 assert.match(googleCallback,/checkoutStore\?"\/"/);
 assert.match(availability,/no-store/);
 assert.doesNotMatch(availability,/GOOGLE_CLIENT_SECRET\s*:/);
});
