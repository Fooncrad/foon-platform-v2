import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("QR popup contains no appearance controls or browser-only saved styling",()=>{
 const code=read("app/components/branded-qr.tsx");
 assert.doesNotMatch(code,/<fieldset>/);
 assert.doesNotMatch(code,/type="color"/);
 assert.doesNotMatch(code,/localStorage/);
 assert.doesNotMatch(code,/t\.reset/);
 assert.match(code,/t\.download/);
 assert.match(code,/t\.share/);
});
test("QR style controls exist in platform and merchant identity settings",()=>{
 const merchant=read("app/restaurant/qr-identity-settings.tsx");
 const platform=read("app/admin/settings/platform-qr-identity.tsx");
 for(const section of [merchant,platform]){
 assert.match(section,/type="color"/);
 assert.match(section,/captionAr/);
 assert.match(section,/captionEn/);
 assert.match(section,/captionFr/);
 }
});
