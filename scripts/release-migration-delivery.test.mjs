import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const directory=new URL("../migrations/",import.meta.url);
test("only explicitly approved migration prefixes may repeat",()=>{
 // The migrator tracks *full filenames* in schema_migrations, not numeric prefixes.
 // Never rename migrations already applied to customer databases.
 const approvedDuplicates=new Map([
  ["0018",["0018_automatic_free_stores.sql","0018_customer_notifications.sql"]],
  ["0060",["0060_order_notes.sql","0060_tenant_business_profiles.sql"]],
  ["9999",["9999_display_advertising.sql","9999_display_advertising_kiosk_campaign_matching.sql","9999_display_player_health_telemetry.sql","9999_display_catalog_sources.sql","9999_display_unified_campaigns.sql","9999_display_z_campaign_lifecycle.sql"]]
 ]);
 const files=readdirSync(directory).filter(file=>/^\d{4}_.+\.sql$/.test(file));
 const byPrefix=new Map();
 for(const file of files){
  const number=file.slice(0,4);
  byPrefix.set(number,[...(byPrefix.get(number)??[]),file]);
 }
 for(const [number,names] of byPrefix){
  if(names.length===1)continue;
  assert.deepEqual(names.slice().sort(),approvedDuplicates.get(number)?.slice().sort(),
   `Unexpected duplicate migration number ${number}: ${names.join(", ")}`);
 }
 // A missing historic file is also an unsafe, unreviewed migration rewrite.
 for(const [number,names] of approvedDuplicates){
  assert.deepEqual(byPrefix.get(number)?.slice().sort(),names.slice().sort());
 }
 for(const [number,name] of [
  ["0152","0152_creator_subscription_referrals.sql"],
  ["0153","0153_platform_payment_transfer_evidence.sql"],
  ["0154","0154_platform_approved_transfer_claims.sql"],
  ["0155","0155_branch_delivery_locations.sql"],
  ["0156","0156_display_advertising_entitlement.sql"],
  ["0162","0162_display_advertising_business_activity_grants.sql"]
 ])assert.deepEqual(byPrefix.get(number),[name]);
 const sql=readFileSync(join(fileURLToPath(directory),byPrefix.get("0155")[0]),"utf8");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS branch_delivery_locations/);
 const displayGrant=readFileSync(join(fileURLToPath(directory),"0156_display_advertising_entitlement.sql"),"utf8");
 assert.match(displayGrant,/p\.code='enterprise'/);
 const displayBusinessGrant=readFileSync(join(fileURLToPath(directory),"0162_display_advertising_business_activity_grants.sql"),"utf8");
 assert.match(displayBusinessGrant,/p\.code='enterprise'/);
 assert.match(displayBusinessGrant,/INSERT INTO package_plan_activity_features/);
 for(const activity of ["restaurant","cafe","sweets","grocery","clothing","perfume","accessories","watches","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"])assert.ok(displayBusinessGrant.includes("SELECT '"+activity+"'"),"Missing Enterprise display grant for "+activity);
 const displayHealth=readFileSync(join(fileURLToPath(directory),"9999_display_player_health_telemetry.sql"),"utf8");
 assert.match(displayHealth,/player_health_json JSON/);
});
test("delivery preferences safely handle empty allowed-country lists",()=>{
 const code=readFileSync(new URL("../app/api/customer/delivery-preferences/route.ts",import.meta.url),"utf8");
 assert.match(code,/countries\.length\?await db\.execute/);
 assert.match(code,/:\[\[\] as RowDataPacket\[\]\]/);
 assert.match(code,/employeePersonalAccessDenied/);
 assert.match(code,/STORE_CUSTOMER_REQUIRED/);
});
