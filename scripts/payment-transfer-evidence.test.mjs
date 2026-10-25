import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {identifyTransferEvidence,TRANSFER_EVIDENCE_MAX_BYTES} from "../lib/payments/transfer-evidence.ts";
import {readLimitedJson} from "../lib/security/limited-json.ts";
const src=p=>readFileSync(new URL(p,import.meta.url),"utf8");
test("payment evidence accepts PDF PNG JPG by verified bytes only and rejects unknown/oversized files",()=>{
 assert.equal(TRANSFER_EVIDENCE_MAX_BYTES,2097152);
 assert.equal(identifyTransferEvidence(Buffer.from("%PDF-1.7\n","utf8")),"application/pdf");
 assert.equal(identifyTransferEvidence(Uint8Array.from([137,80,78,71,13,10,26,10,...Array(16).fill(0)])),"image/png");
 assert.equal(identifyTransferEvidence(Uint8Array.from([255,216,255,12,34,255,217])),"image/jpeg");
 for(const bad of [new Uint8Array(0),Buffer.from("<script>bad</script>"),Buffer.from("PK\\u0003\\u0004"),new Uint8Array(2097153),Uint8Array.from([137,80,78,71])])
  assert.equal(identifyTransferEvidence(bad),null);
});
test("transfer evidence may be changed only by its merchant owner while pending, and downloaded only by platform finance admin",()=>{
 const merchant=src("../app/api/tenant/subscription-requests/evidence/route.ts");
 const admin=src("../app/api/admin/billing/evidence/[id]/route.ts");
 assert.match(merchant,/assertSameOrigin/);
 assert.match(merchant,/requireTenantMembership\(actor,tenantId,\["owner"\]/);
 assert.match(merchant,/status='pending' FOR UPDATE/);
 assert.match(merchant,/TRANSFER_EVIDENCE_MAX_BYTES/);
 assert.match(admin,/requirePlatformRole\(actor,\["super_admin","admin"\]\)/);
 assert.match(admin,/Content-Disposition/);
 assert.match(admin,/nosniff/);
 assert.match(admin,/no-store/);
 assert.doesNotMatch(admin,/\["super_admin","admin","support"\]/);
});


test("subscription upgrade JSON accepts valid data but rejects oversized declared and chunked bodies",async()=>{
 const url="https://nfoodz.com/api/tenant/subscription-requests";
 const body={tenantId:"12345678-1234-1234-1234-123456789012",planId:"12345678-1234-1234-1234-123456789013",billingCycle:"monthly",transferReference:"TRANSFER1234"};
 const make=(value,headers={})=>new Request(url,{method:"POST",body:value,headers});
 assert.deepEqual(await readLimitedJson(make(JSON.stringify(body)),2048),body);
 await assert.rejects(readLimitedJson(make("{}",{"content-length":"2049"}),2048),/BATCH_TOO_LARGE/);
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1025));controller.enqueue(new Uint8Array(1025));controller.close();}});
 await assert.rejects(readLimitedJson(new Request(url,{method:"POST",body:stream,duplex:"half"}),2048),/BATCH_TOO_LARGE/);
 await assert.rejects(readLimitedJson(make("{}",{"content-length":"not-a-number"}),2048),/INVALID_CONTENT_LENGTH/);
 assert.equal(await readLimitedJson(make("{broken"),2048),null);
});
test("subscription upgrade POST uses bounded JSON parser without weakening owner and payment checks",()=>{
 const source=src("../app/api/tenant/subscription-requests/route.ts");
 assert.match(source,/readLimitedJson\(request,2048\)/);
 assert.doesNotMatch(source,/request\.json\(\)/);
 assert.match(source,/BODY_TOO_LARGE/);
 assert.match(source,/requireTenantMembership\(user,id,\["owner"\]/);
 assert.match(source,/status='active' FOR UPDATE/);
 assert.match(source,/status='pending' LIMIT 1/);
});
