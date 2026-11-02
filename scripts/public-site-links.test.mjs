import test from "node:test";
import assert from "node:assert/strict";
import {uniquePublicFooterPages,localizedPublicFooterPages,publicContentPageHref} from "../lib/ux/public-site-links.ts";
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

test("localized CMS footer titles follow AR/EN/FR and safely fall back to Arabic",()=>{
 const pages=[{slug:"privacy",title:"الخصوصية",titleEn:"Privacy",titleFr:"Confidentialité"},{slug:"terms",title:"الشروط",titleEn:"Terms",titleFr:""},{slug:"refund",title:"الاسترجاع",titleEn:"Refunds",titleFr:"Remboursements"}];
 assert.deepEqual(localizedPublicFooterPages(pages,"ar").map(p=>p.title),["الخصوصية","الشروط","الاسترجاع"]);
 assert.deepEqual(localizedPublicFooterPages(pages,"en").map(p=>p.title),["Privacy","Terms","Refunds"]);
 assert.deepEqual(localizedPublicFooterPages(pages,"fr").map(p=>p.title),["Confidentialité","الشروط","Remboursements"]);
 assert.equal(pages[0].title,"الخصوصية"); // The source is never mutated.
});
test("localized footer deduplicates labels in the selected language and keeps forbidden slugs hidden",()=>{
 const pages=[{slug:"first",title:"عنوان 1",titleEn:"About"},{slug:"second",title:"عنوان 2",titleEn:"About"},{slug:"login",title:"تسجيل",titleEn:"Login"},{slug:"third",title:"عنوان 3",titleEn:"Contact"}];
 assert.deepEqual(localizedPublicFooterPages(pages,"en").map(p=>p.slug),["first","third"]);
 assert.deepEqual(localizedPublicFooterPages(pages,"ar").map(p=>p.slug),["first","second","third"]);
});

test("explicit CMS locale stays in links between published pages",()=>{
 assert.equal(publicContentPageHref("privacy","fr"),"/p/privacy?lang=fr");
 assert.equal(publicContentPageHref("about","en"),"/p/about?lang=en");
 assert.equal(publicContentPageHref("الشروط","ar"),"/p/%D8%A7%D9%84%D8%B4%D8%B1%D9%88%D8%B7?lang=ar");
 assert.equal(publicContentPageHref("privacy"),"/p/privacy");
});
