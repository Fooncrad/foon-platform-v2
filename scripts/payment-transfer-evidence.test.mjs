import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {identifyTransferEvidence,TRANSFER_EVIDENCE_MAX_BYTES} from "../lib/payments/transfer-evidence.ts";
import {readLimitedFormData} from "../lib/security/limited-form-data.ts";
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


test("valid multipart receipt upload keeps fields and file intact",async()=>{
 const form=new FormData();
 form.set("paymentRequestId","12345678-1234-1234-1234-123456789012");
 form.set("tenantId","12345678-1234-1234-1234-123456789013");
 form.set("file",new File([new Uint8Array([37,80,68,70,45,49,46,55])],"receipt.pdf",{type:"application/pdf"}));
 const data=await readLimitedFormData(new Request("https://nfoodz.com/api/tenant/subscription-requests/evidence",{method:"POST",body:form}),TRANSFER_EVIDENCE_MAX_BYTES+16384);
 assert.equal(data.get("paymentRequestId"),"12345678-1234-1234-1234-123456789012");
 assert.equal(data.get("tenantId"),"12345678-1234-1234-1234-123456789013");
 assert.equal(data.get("file").name,"receipt.pdf");
});
test("multipart receipt uploads reject oversized declared and chunked bodies",async()=>{
 const url="https://nfoodz.com/api/tenant/subscription-requests/evidence";
 const limit=TRANSFER_EVIDENCE_MAX_BYTES+16384;
 await assert.rejects(readLimitedFormData(new Request(url,{method:"POST",body:"abc",headers:{"content-length":String(limit+1)}}),limit),/BODY_TOO_LARGE/);
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(1500));controller.enqueue(new Uint8Array(1500));controller.close();}});
 await assert.rejects(readLimitedFormData(new Request(url,{method:"POST",body:stream,duplex:"half",headers:{"content-type":"multipart/form-data; boundary=x"}}),2048),/BODY_TOO_LARGE/);
 await assert.rejects(readLimitedFormData(new Request(url,{method:"POST",body:"abc",headers:{"content-length":"not-a-number"}}),limit),/INVALID_CONTENT_LENGTH/);
});
test("receipt upload route uses bounded multipart parser and keeps owner authorization",()=>{
 const source=src("../app/api/tenant/subscription-requests/evidence/route.ts");
 assert.match(source,/readLimitedFormData\(request,TRANSFER_EVIDENCE_MAX_BYTES\+16384\)/);
 assert.doesNotMatch(source,/request\.formData\(\)/);
 assert.match(source,/EVIDENCE_TOO_LARGE/);
 assert.match(source,/requireTenantMembership\(actor,tenantId,\["owner"\]/);
});
