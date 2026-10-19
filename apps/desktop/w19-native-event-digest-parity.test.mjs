import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";

const desktop=dirname(fileURLToPath(import.meta.url));
const root=join(desktop,"src-tauri");
const [native,lib,cargo]=await Promise.all([
  readFile(join(root,"src","native_event_digest.rs"),"utf8"),
  readFile(join(root,"src","lib.rs"),"utf8"),
  readFile(join(root,"Cargo.toml"),"utf8")
]);
const fixtures=[
  {
    name:"created-order",
    event:{
      seq:11,order_id:"order-fixture-19",kind:"created",
      payload:{
        id:"order-fixture-19",branchId:"branch-fixture-19",
        items:[{id:"item-A",quantity:2,expectedUnitCents:950,expectedCurrency:"SAR"}]
      }
    },
    pinned:"2bf8b997b4161b8a3535364f3989439a14e0419d7ef90e1ac7ef2c298f7e092c"
  },
  {
    name:"status-update",
    event:{
      seq:12,order_id:"order-fixture-19",kind:"status",
      payload:{id:"order-fixture-19",status:"preparing",updatedAt:"2026-10-19T00:00:00.000Z"}
    },
    pinned:"1bee33364a8b066265ca555ec89f82bb7e46f44a277675037eb20e67d8fe5343"
  },
  {
    name:"utf8-arabic",
    event:{
      seq:13,order_id:"order-fixture-19",kind:"status",
      payload:{note:"قهوة عربية",status:"ready"}
    },
    pinned:"51f3d30997ae2dd4154e14de86755a30e2b52c5dbfd0c0e3f5859a358762c536"
  }
];
test("W19 Node SHA256 agrees with all pinned CNG digest fixture hashes",()=>{
  for(const {name,event,pinned} of fixtures){
    assert.equal(eventDigest(event),pinned,name);
    assert(native.includes(pinned),name+" must have a native test assertion");
  }
});
test("W19 native canonical uses explicit field order and unmodified raw JSON",()=>{
  assert.match(native,/#\[derive\(Serialize\)\]\s*struct JSOrderEvent/);
  assert.match(native,/seq:\s*u64,/);
  assert.match(native,/#\[serde\(rename="orderId"\)\]/);
  assert.match(native,/order_id:\s*&'a str,/);
  assert.match(native,/kind:\s*&'a str,/);
  assert.match(native,/payload:\s*&'a RawValue,/);
  assert.match(native,/RawValue::from_string\(event\.payload_json\.to_owned\(\)\)/);
  assert.match(cargo,/serde_json\s*=\s*\{\s*version\s*=\s*"1",\s*features\s*=\s*\["raw_value"\]/);
});
test("W19 SHA256 uses Windows CNG without leaking secrets to WebView",()=>{
  assert.match(native,/#\[link\(name = "bcrypt"\)\]/);
  assert.match(native,/BCryptOpenAlgorithmProvider/);
  assert.match(native,/BCryptHashData/);
  assert.match(native,/BCryptFinishHash/);
  assert.match(lib,/#\[cfg\(windows\)\]\s*mod native_event_digest;/);
  assert.doesNotMatch(native,/#\[tauri::command\]/);
  assert.doesNotMatch(native,/FOON_LAN_DB|W05|run-w10|reqwest|TcpStream|std::fs::write/);
});
test("W19 explicitly refuses unsafe input and only verifies digest; never ACKs",()=>{
  assert.match(native,/MAX_SAFE_JS_INTEGER/);
  assert.match(native,/is_compact_json\(event\.payload_json\)/);
  assert.match(native,/!matches!\(event\.kind, "created" \| "status"\)/);
  assert.match(native,/fn verify_expected_event_digest/);
  assert.match(native,/different \|= supplied\[i\]\^expected\[i\]/);
  assert.doesNotMatch(native,/\#\[tauri::command\]|\bmark_synced\b|\boutbox_ack\b|\bUPDATE outbox\b/);
});
test("W19 digest replay or changed JSON property order produces different hash",()=>{
  const base=fixtures[0].event;
  assert.notEqual(eventDigest({...base,seq:12}),fixtures[0].pinned);
  assert.notEqual(eventDigest({...base,payload:{...base.payload,items:[]}}),fixtures[0].pinned);
  assert.notEqual(eventDigest({...base,payload:{items:base.payload.items,branchId:base.payload.branchId,id:base.payload.id}}),fixtures[0].pinned);
});
