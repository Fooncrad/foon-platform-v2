import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validPoint,greatCircleKm,deliveryZoneCheck,parseLocationSettings,defaultLocationSettings} from "../lib/tenant/free-location.ts";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const base={...defaultLocationSettings,deliveryMode:"radius",latitude:24.7136,longitude:46.6753,radiusKm:10};

test("latitude and longitude validation must be independent",()=>{
 assert.equal(validPoint(24.7136,46.6753),true);
 for(const c of [[24.7,200],[95,46],[24,NaN],[Infinity,46],[24,null],["24",46],[24,"46"]])assert.equal(validPoint(c[0],c[1]),false);
});
test("free GPS radius is great-circle only and blocks missing/outside coordinates",()=>{
 const d=greatCircleKm(24.7136,46.6753,24.7136,46.6753);
 assert.equal(d,0);
 assert.equal(deliveryZoneCheck(base,null,null).allowed,false);
 assert.deepEqual(deliveryZoneCheck(base,null,null),{allowed:false,code:"DELIVERY_GPS_REQUIRED"});
 const nearby=deliveryZoneCheck(base,24.74,46.70);
 assert.equal(nearby.allowed,true);
 const far=deliveryZoneCheck(base,25.1,47.4);
 assert.deepEqual(far,{allowed:false,code:"DELIVERY_OUT_OF_RANGE"});
 assert.deepEqual(deliveryZoneCheck({...base,deliveryMode:"manual"},null,null),{allowed:true});
});
test("invalid tenant settings do not silently downgrade radius mode",()=>{
 assert.equal(parseLocationSettings({...base,longitude:181}),null);
 assert.equal(parseLocationSettings({...base,latitude:100}),null);
 assert.equal(parseLocationSettings({...base,radiusKm:0}),null);
 assert.equal(parseLocationSettings({...base,radiusKm:501}),null);
 assert.equal(parseLocationSettings({...base,longitude:null}),null);
 assert.equal(parseLocationSettings({...base,googleAnalyticsId:"<script>"}),null);
 assert.equal(parseLocationSettings({...base,facebookPixelId:"foo"}),null);
 assert.equal(parseLocationSettings({...base,aiAssistantRequested:"true"}),null);
 assert.equal(parseLocationSettings({...base,latitude:"24.7136",longitude:"46.6753",radiusKm:"10"})?.radiusKm,10);
 assert.equal(parseLocationSettings({...base,deliveryMode:"manual",latitude:null,longitude:null,radiusKm:null})?.deliveryMode,"manual");
});
test("tenant role, tenant id, same-origin and server order guards exist",()=>{
 const api=read("app/api/restaurant/location-settings/route.ts"),
  orders=read("app/api/customer/orders/route.ts");
 assert.match(api,/requireTenantMembership\(user,request\.headers\.get\("x-foon-tenant"\)/);
 assert.match(api,/\["owner","manager"\]/);
 assert.match(api,/assertSameOrigin\(request\)/);
 assert.match(api,/tenant_id=\?/);
 assert.match(api,/requireAllAdditionalBranchesUnlocked\(ctx.tenantId,ctx.user\)/);
 assert.match(orders,/deliveryZoneCheck/);
 assert.match(orders,/DELIVERY_OUT_OF_RANGE|decision\.code/);
 assert.ok(orders.indexOf("deliveryZoneCheck")<orders.indexOf("await createOrder"),"check before creating orders");
});
test("admin controls are settings only; no secret exposed or silent tracking activated",()=>{
 const api=read("app/api/admin/integrations/route.ts"),editor=read("app/admin/settings/integration-settings.tsx"),
 merchant=read("app/restaurant/free-location-settings.tsx"),migration=read("migrations/0105_tenant_free_location_settings.sql");
 assert.match(api,/currentActiveAdminUserId\(\)/);
 assert.match(api,/requirePlatformRole/);
 assert.match(api,/platform_audit_events/);
 assert.match(api,/recaptchaSecretPresent:Boolean\(process\.env\.RECAPTCHA_SECRET_KEY\)/);
 assert.doesNotMatch(api,/recaptchaSecret:process\.env|aiKey:process\.env/);
 assert.match(api,/integrationActive:false/);
 assert.match(editor,/الحماية ليست مفعلة برمجيًا/);
 assert.match(merchant,/navigator\.geolocation\.getCurrentPosition/);
 assert.match(merchant,/openstreetmap\.org/);
 assert.match(merchant,/لا يشغّلها تلقائيًا/);
 assert.match(migration,/PRIMARY KEY/);
 assert.match(migration,/FOREIGN KEY \(tenant_id\)/);
});
