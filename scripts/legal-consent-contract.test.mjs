import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(path)=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("platform, customer, inline and business forms require explicit legal acceptance",()=>{
 const component=read("app/components/required-legal-consent.tsx");
 assert.match(component,/type="checkbox" name=\{name\} required/);
 assert.match(component,/href="\/p\/terms"/);
 assert.match(component,/href="\/p\/privacy"/);
 const forms=[
  "app/register/page.tsx",
  "app/[slug]/register/customer-form.tsx",
  "app/[slug]/inline-customer-auth.tsx",
  "app/restaurant/register/page.tsx"
 ];
 for(const file of forms){
  const src=read(file);
  assert.match(src,/RequiredLegalConsent/,file);
  assert.match(src,/legalAccepted/,file);
 }
});

test("registration and onboarding reject direct API bypass and persist acceptance",()=>{
 for(const path of ["app/api/auth/register/route.ts","app/api/customer/register/route.ts","app/api/restaurant/onboard/route.ts"]){
  const src=read(path);
  assert.match(src,/legalAccepted!==true/,path);
  assert.match(src,/LEGAL_CONSENT_REQUIRED/,path);
  assert.match(src,/legal_accepted_at=/,path);
 }
});

test("Google registration requires state-bound consent, existing verified accounts can sign in",()=>{
 const start=read("app/api/auth/google/start/route.ts");
 const callback=read("app/api/auth/google/callback/route.ts");
 assert.match(start,/assertSameOrigin\(request\)/);
 assert.match(start,/body\.legalAccepted!==true/);
 assert.match(start,/foon_google_legal_consent/);
 assert.match(callback,/validGoogleOauthState\(incoming,legalConsentState\)/);
 assert.match(callback,/GOOGLE_LEGAL_CONSENT_REQUIRED/);
 assert.match(callback,/legal_accepted_at=NOW\(\)/);
});
