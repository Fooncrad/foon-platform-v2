import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {identifyTransferEvidence,TRANSFER_EVIDENCE_MAX_BYTES} from "../lib/payments/transfer-evidence.ts";
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
