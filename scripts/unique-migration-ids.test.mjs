import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
const root=new URL("../migrations/",import.meta.url);
test("each SQL migration numeric prefix has one unique owner",()=>{
 const names=readdirSync(root).filter(n=>/^\d{4}_.+\.sql$/.test(n));
 const seen=new Map();
 for(const name of names){
  const prefix=name.slice(0,4);
  assert.equal(seen.has(prefix),false,`Migration prefix ${prefix} duplicated by ${seen.get(prefix)} and ${name}`);
  seen.set(prefix,name);
 }
 assert.equal(seen.get("0152"),"0152_creator_subscription_referrals.sql");
 assert.equal(seen.get("0153"),"0153_platform_payment_transfer_evidence.sql");
 assert.equal(seen.get("0154"),"0154_platform_approved_transfer_claims.sql");
 assert.equal(seen.get("0155"),"0155_branch_delivery_locations.sql");
 const sql=readFileSync(join(fileURLToPath(root),seen.get("0155")),"utf8");
 assert.match(sql,/CREATE TABLE IF NOT EXISTS branch_delivery_locations/);
});
