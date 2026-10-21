import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

const directory=new URL("../migrations/",import.meta.url);
test("migration numbers must be unique across all release batches",()=>{
 const files=readdirSync(directory).filter(file=>/^\d{4}_.+\.sql$/.test(file));
 const found=new Map();
 for(const file of files){
  const number=file.slice(0,4);
  assert.ok(!found.has(number),`Duplicate migration ID ${number}: ${found.get(number)} and ${file}`);
  found.set(number,file);
 }
 for(const [number,name] of [
  ["0152","0152_creator_subscription_referrals.sql"],
  ["0153","0153_platform_payment_transfer_evidence.sql"],
  ["0154","0154_platform_approved_transfer_claims.sql"],
  ["0155","0155_branch_delivery_locations.sql"]
 ])assert.equal(found.get(number),name);
 const sql=readFileSync(join(fileURLToPath(directory),found.get("0155")),"utf8");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS branch_delivery_locations/);
});
test("delivery preferences safely handle empty allowed-country lists",()=>{
 const code=readFileSync(new URL("../app/api/customer/delivery-preferences/route.ts",import.meta.url),"utf8");
 assert.match(code,/countries\.length\?await db\.execute/);
 assert.match(code,/:\[\[\] as RowDataPacket\[\]\]/);
 assert.match(code,/employeePersonalAccessDenied/);
 assert.match(code,/STORE_CUSTOMER_REQUIRED/);
});
