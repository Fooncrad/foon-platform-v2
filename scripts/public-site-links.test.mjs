import test from "node:test";
import assert from "node:assert/strict";
import {uniquePublicFooterPages} from "../lib/ux/public-site-links.ts";
test("public footer hides duplicate title/slug entries and reserved account routes",()=>{
 const pages=[{slug:"terms",title:"الشروط"},{slug:"TERMS",title:"Terms duplicated"},{slug:"privacy",title:"الخصوصية"},{slug:"copy",title:"الخصوصية"},{slug:"account",title:"حساب"},{slug:"billing",title:"الفوترة"},{slug:"market",title:"السوق"}];
 assert.deepEqual(uniquePublicFooterPages(pages).map(page=>page.slug),["terms","privacy"]);
});
test("public footer rejects empty and path-unsafe slugs without suppressing valid localized CMS pages",()=>{
 const pages=[{slug:"",title:"Empty"},{slug:"../admin",title:"Invalid"},{slug:"a/b",title:"Slash"},{slug:"refund-policy",title:"الاسترجاع"},{slug:"سياسة-الخصوصية",title:"الخصوصية"}];
 assert.deepEqual(uniquePublicFooterPages(pages).map(page=>page.slug),["refund-policy","سياسة-الخصوصية"]);
});
test("does not mutate source pages or remove unique published content",()=>{
 const raw=[{slug:"contact",title:"Contact"},{slug:"FAQ",title:"FAQ"}];
 const copy=JSON.stringify(raw);
 assert.deepEqual(uniquePublicFooterPages(raw),raw);
 assert.equal(JSON.stringify(raw),copy);
});
