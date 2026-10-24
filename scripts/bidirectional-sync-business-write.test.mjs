import test from "node:test";
import assert from "node:assert/strict";
import {requireAffectedBusinessWrite} from "../lib/platform/bidirectional-sync-business-write.mjs";
test("strict business adapter requires one successful row",async()=>{
 const db={async execute(sql,args){assert.equal(sql,"UPDATE catalog SET name=? WHERE id=? AND tenant_id=? AND branch_id=?");assert.deepEqual(args,["Coffee","item","tenant","branch"]);return [{affectedRows:1}]}};
 assert.equal(await requireAffectedBusinessWrite(db,"UPDATE catalog SET name=? WHERE id=? AND tenant_id=? AND branch_id=?",["Coffee","item","tenant","branch"]),true);
});
test("zero or multiple rows must never confirm journal mutation",async()=>{
 for(const count of [0,2]){
  const db={async execute(){return [{affectedRows:count}]}};
  await assert.rejects(()=>requireAffectedBusinessWrite(db,"UPDATE catalog SET name=?",["Coffee"]),/SYNC_BUSINESS_WRITE_(NOT_APPLIED|ROW_COUNT)/);
 }
});
test("SQL operations outside single mutation statement are rejected",async()=>{
 const db={async execute(){throw Error("must not be reached")}};
 for(const sql of ["SELECT * FROM catalog","UPDATE catalog SET name=?; DELETE FROM staff","WITH x AS (SELECT 1) UPDATE catalog SET name=?"]){
  await assert.rejects(()=>requireAffectedBusinessWrite(db,sql,[]),/SYNC_INVALID_BUSINESS_WRITE/);
 }
});
