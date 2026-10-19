// W26: ephemeral ECDSA P-256 private key exists only in this Node process.
// Node signs synthetic documents, Rust verifies using Win CNG public key.
// Never writes databases, uploads keys, opens W05/W06 or accesses production.
import {generateKeyPairSync,sign} from "node:crypto";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import assert from "node:assert/strict";
if(process.argv.length!==3||process.argv[2]!=="--run")throw Error("W26_EXPLICIT_TEST_FLAG_REQUIRED");
if(process.env.FOON_W26_SIGNED_DOCUMENT||process.env.FOON_W26_TEST_PUBLIC_XY)
  throw Error("W26_PREEXISTING_TEST_CREDENTIAL_ENV_REFUSED");

const root=fileURLToPath(new URL(".",import.meta.url));
const {publicKey,privateKey}=generateKeyPairSync("ec",{namedCurve:"prime256v1"});
const jwk=publicKey.export({format:"jwk"});
const xy=Buffer.concat([Buffer.from(jwk.x,"base64url"),Buffer.from(jwk.y,"base64url")]);
assert.equal(xy.length,64);
const original={
  revision:7,tenantId:"tenant-fixture-w26",branchId:"branch-fixture-w26",
  issuedAt:1800000000,expiresAt:1800000600,
  items:[
    {id:"item-A",unitCents:950,currency:"SAR",enabled:true,stockQty:10},
    {id:"item-B",unitCents:500,currency:"SAR",enabled:false,stockQty:0}
  ]
};
const scenarios=[
  "valid","tamper-price","tamper-stock","tamper-tenant",
  "wrong-expected-tenant","wrong-expected-branch","expired",
  "future-issued","stale-revision","long-lease","duplicate-item",
  "unknown-field","invalid-currency","wrong-key","invalid-signature"
];
const clone=x=>JSON.parse(JSON.stringify(x));
function signedSnapshot(snapshot){
  const rows=snapshot.items.map(i=>[i.id,i.unitCents,i.currency,i.enabled,i.stockQty]);
  const ordered=[snapshot.revision,snapshot.tenantId,snapshot.branchId,
    snapshot.issuedAt,snapshot.expiresAt,rows];
  const msg=Buffer.concat([
    Buffer.from("FOON-CATALOG-V1\n"),
    Buffer.from(JSON.stringify(ordered),"utf8")
  ]);
  const signature=sign("sha256",msg,{key:privateKey,dsaEncoding:"ieee-p1363"});
  assert.equal(signature.length,64);
  return {snapshot,signature:signature.toString("hex")};
}
for(const name of scenarios){
  const altered=clone(original);
  let doc;
  if(name==="expired"){altered.issuedAt=1799990000;altered.expiresAt=1799990100;}
  if(name==="future-issued"){altered.issuedAt=1800000100;altered.expiresAt=1800000500;}
  if(name==="long-lease"){altered.expiresAt=1800000000+604801;}
  if(name==="duplicate-item"){altered.items.push({...altered.items[0]});}
  if(name==="unknown-field"){altered.items[0].printerId="browser-supplied";}
  if(name==="invalid-currency"){altered.items[0].currency="sar";}
  doc=signedSnapshot(altered);
  if(name==="tamper-price")doc.snapshot.items[0].unitCents=951;
  if(name==="tamper-stock")doc.snapshot.items[0].stockQty=11;
  if(name==="tamper-tenant")doc.snapshot.tenantId="other-tenant";
  if(name==="invalid-signature")doc.signature="f".repeat(128);
  const publicXY=name==="wrong-key"?
    Buffer.concat([Buffer.alloc(32),Buffer.alloc(32)]):xy;
  const result=spawnSync("cargo",[
    "test","--offline","--lib",
    "native_signed_catalog::tests::synthetic_signed_catalog_signature_case",
    "--","--ignored"
  ],{
    cwd:join(root,"src-tauri"),stdio:"inherit",windowsHide:true,
    env:{...process.env,FOON_W26_CASE:name,
      FOON_W26_SIGNED_DOCUMENT:JSON.stringify(doc),
      FOON_W26_TEST_PUBLIC_XY:publicXY.toString("hex")
    }
  });
  if(result.error||result.status!==0)throw Error("W26_WINDOWS_CNG_TEST_FAILED_"+name);
  console.log("PASS W26 ASYMMETRIC SIGNATURE TEST: "+name.toUpperCase());
}
console.log("W26 ALL FIFTEEN EPHEMERAL CNG CATALOG SIGNATURE CASES PASSED");
