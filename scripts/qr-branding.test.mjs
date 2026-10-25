import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
test("platform QR is placed immediately below public header",()=>{
 const source=read("app/public-site-chrome.tsx");
 assert.match(source,/<\/header><div className="foonPlatformQrStrip">/);
 assert.match(source,/<BrandedQr scope="platform"/);
});
test("restaurant and shop QR use the same themed component without displaying raw URL",()=>{
 const source=read("app/[slug]/storefront-qr.tsx"),shared=read("app/components/branded-qr.tsx");
 assert.match(source,/<BrandedQr scope="store"/);
 assert.match(shared,/scope==="platform"\?"\/":scope==="customer"\?"\/customer":"\/s\/"/);
 assert.doesNotMatch(shared,/<a href=\{base\}>/);
 assert.match(shared,/localStorage\.setItem/);
 assert.match(shared,/https:\/\/quickchart\.io\/qr/);
});
