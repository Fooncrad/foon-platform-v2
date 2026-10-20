import test from "node:test";
import assert from "node:assert/strict";
import {resolvePublicContentLanguage,publicContentText} from "../lib/ux/public-content-locale.ts";
test("explicit published-content URL locale wins over cookie without affecting global account scope",()=>{
 assert.equal(resolvePublicContentLanguage("fr","ar"),"fr");
 assert.equal(resolvePublicContentLanguage("en","fr"),"en");
 assert.equal(resolvePublicContentLanguage(undefined,"fr"),"fr");
 assert.equal(resolvePublicContentLanguage("de","en"),"en");
 assert.equal(resolvePublicContentLanguage("../admin","xx"),"ar");
});
test("content fields use requested language and fall back to Arabic without rendering null",()=>{
 const row={title_ar:"الخصوصية",title_en:"Privacy",title_fr:"",body_ar:"النص",body_en:null,body_fr:"Le texte"};
 assert.equal(publicContentText(row,"title","en"),"Privacy");
 assert.equal(publicContentText(row,"title","fr"),"الخصوصية");
 assert.equal(publicContentText(row,"body","en"),"النص");
 assert.equal(publicContentText(row,"body","fr"),"Le texte");
 assert.equal(publicContentText({},"body","ar"),"");
});
