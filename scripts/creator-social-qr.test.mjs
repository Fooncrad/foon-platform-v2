import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 CREATOR_SOCIAL_PLATFORMS,normalizeCreatorSocialLink,parseCreatorSocialLinks
} from "../lib/creator/social-links.ts";

import {publicCreatorImageMime} from "../lib/creator/image-policy.ts";

const src=path=>readFileSync(new URL(path,import.meta.url),"utf8");
test("12 platform icons and valid social URLs are accepted with strict HTTPS",()=>{
 const cases={
  instagram:"https://www.instagram.com/foon.creates",
  tiktok:"https://www.tiktok.com/@foon.creator",
  snapchat:"https://www.snapchat.com/add/fooncreator",
  youtube:"https://www.youtube.com/@foon",
  x:"https://x.com/fooncreator",
  facebook:"https://www.facebook.com/foon.creator",
  whatsapp:"https://wa.me/966500000000",
  telegram:"https://t.me/fooncreator",
  threads:"https://www.threads.net/@fooncreator",
  linkedin:"https://www.linkedin.com/in/foon-creator",
  pinterest:"https://www.pinterest.com/fooncreator",
  website:"https://portfolio.example.org/creator"
 };
 assert.equal(CREATOR_SOCIAL_PLATFORMS.length,12);
 assert.deepEqual(CREATOR_SOCIAL_PLATFORMS.map(p=>p.key),Object.keys(cases));
 for(const [platform,url] of Object.entries(cases)){
  assert.equal(normalizeCreatorSocialLink(platform,url)?.url,url,platform);
 }
 const links=parseCreatorSocialLinks(Object.entries(cases).map(([platform,url])=>({platform,url})));
 assert.equal(links?.length,12);
});
test("reject scripts, login links, impersonation hosts, private network URLs and malformed accounts",()=>{
 const invalid=[
  ["instagram","javascript:alert(1)"],
  ["instagram","http://instagram.com/fooncreator"],
  ["instagram","https://instagram.com.evil.test/fooncreator"],
  ["instagram","https://evil.test/fooncreator"],
  ["instagram","https://instagram.com/"],
  ["instagram","https://user:pass@instagram.com/fooncreator"],
  ["instagram","https://instagram.com:443/fooncreator#section"],
  ["tiktok","https://www.tiktok.com/@foon/../../owner"],
  ["tiktok","https://www.tiktok.com/@foon%2Fother"],
  ["whatsapp","https://wa.me/123"],
  ["whatsapp","https://wa.me/000000000000"],
  ["whatsapp","https://wa.me/966500000000?text=SECRET"],
  ["linkedin","https://www.linkedin.com/feed/"],
  ["website","https://localhost/admin"],
  ["website","https://127.0.0.1/private"],
  ["website","https://192.168.1.1/"],
  ["website","https://private.local/"],
  ["website","ftp://public.example.com/"],
  ["website","https://xn--bad..example/"]
 ];
 for(const [platform,url] of invalid){
  // Query text in wa.me links is intentionally stripped, never exposed on public profile.
  if(platform==="whatsapp"&&url.includes("?text=")){assert.equal(normalizeCreatorSocialLink(platform,url)?.url,"https://wa.me/966500000000");continue;}
  assert.equal(normalizeCreatorSocialLink(platform,url),null,platform+" "+url);
 }
 assert.equal(parseCreatorSocialLinks([{platform:"x",url:"https://x.com/foon"},{platform:"x",url:"https://x.com/second"}]),null);
 assert.equal(parseCreatorSocialLinks(Array(13).fill({platform:"x",url:"https://x.com/foon"})),null);
 assert.equal(parseCreatorSocialLinks([{platform:"not_a_platform",url:"https://evil.com/anything"}]),null);
});
test("creator social API is account-scoped and public links follow visibility",()=>{
 const migration=src("../migrations/0108_customer_creator_social_links.sql");
 assert.match(migration,/FOREIGN KEY\(user_id\) REFERENCES customer_creator_profiles\(user_id\)/);
 assert.match(migration,/PRIMARY KEY\(user_id,platform\)/);
 const api=src("../app/api/account/creator-social-links/route.ts");
 assert.match(api,/parseCreatorSocialLinks/);
 assert.match(api,/customerCreatorUserId/);
 assert.match(api,/assertSameOrigin\(request\)/);
 assert.match(api,/WHERE user_id=\?/);
 assert.match(api,/FOR UPDATE/);
 const publicPage=src("../app/creators/[handle]/page.tsx");
 assert.match(publicPage,/p.visibility='public'/);
 assert.match(publicPage,/normalizeCreatorSocialLink/);
 assert.match(publicPage,/CreatorSocialIcon/);
 assert.match(publicPage,/rel="noopener noreferrer nofollow external"/);
 const editor=src("../app/customer/creator/creator-editor.tsx");
 assert.match(editor,/CreatorSocialLinksEditor/);
 assert.match(editor,/CreatorQr/);
});
test("QR is genuine first-party SVG based on verified public profile and canonical origin",()=>{
 const route=src("../app/api/creators/[handle]/qr/route.ts");
 assert.match(route,/QRCode.toString/);
 assert.match(route,/type:"svg"/);
 assert.match(route,/p.visibility='public'/);
 assert.match(route,/NOT EXISTS \(SELECT 1 FROM memberships/);
 assert.match(route,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 assert.match(route,/Cache-Control":"no-store"/);
 assert.doesNotMatch(route,/request.headers.get\("host"\)/);
 assert.match(route,/new URL\("\/creators\/"/);
 const publicPage=src("../app/creators/[handle]/page.tsx");
 assert.match(publicPage,/encodeURIComponent\(handle\)\+"\/qr"/);
});

test("public creator images use their stored raster MIME, never executable SVG or HTML",()=>{
 for(const type of ["image/jpeg","image/png","image/webp"])assert.equal(publicCreatorImageMime(type),type);
 for(const type of ["image/svg+xml","text/html","application/javascript","",null,undefined])
  assert.equal(publicCreatorImageMime(type),null);
 const avatar=src("../app/api/creators/[handle]/avatar/route.ts");
 const portfolio=src("../app/api/creators/[handle]/media/[id]/route.ts");
 assert.match(avatar,/up\.\$\{mimeColumn\} AS mime/);
 assert.match(avatar,/publicCreatorImageMime\(rows\[0\]\.mime\)/);
 assert.match(portfolio,/SELECT m\.image_data,m\.mime_type/);
 assert.match(portfolio,/publicCreatorImageMime\(rows\[0\]\.mime_type\)/);
 for(const route of [avatar,portfolio]){
  assert.match(route,/p\.visibility='public'/);
  assert.match(route,/X-Content-Type-Options":"nosniff"/);
  assert.match(route,/Cache-Control":"no-store"/);
  assert.doesNotMatch(route,/Content-Type":"image\/jpeg"/);
 }
});
