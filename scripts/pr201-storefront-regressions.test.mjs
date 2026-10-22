import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../app/[slug]/activity-storefront.tsx",import.meta.url),"utf8");
const start=source.indexOf(" const brandingText=");
const end=source.indexOf(" const cart=",start);
assert.ok(start>=0&&end>start,"localized branding policy must exist");
const implementation=source.slice(start,end).replace("(key:string)","(key)");
const localize=new Function("language","branding","name",implementation+";return {storeName,storeAddress};");

test("English and French storefronts use translated brand and address",()=>{
 assert.deepEqual(localize("en",{brandName:"عربي",brandNameEn:"English",brandNameFr:"Français",address:"الرياض",addressEn:"Riyadh",addressFr:"Riyad"},"Fallback"),{storeName:"English",storeAddress:"Riyadh"});
 assert.deepEqual(localize("fr",{brandName:"عربي",brandNameEn:"English",brandNameFr:"Français",address:"الرياض",addressEn:"Riyadh",addressFr:"Riyad"},"Fallback"),{storeName:"Français",storeAddress:"Riyad"});
});

test("Arabic, missing translations and whitespace fall back safely",()=>{
 assert.deepEqual(localize("ar",{brandName:"عربي",brandNameEn:"English",address:"الرياض"},"Fallback"),{storeName:"عربي",storeAddress:"الرياض"});
 assert.deepEqual(localize("fr",{brandName:"عربي",brandNameFr:"   ",address:"الرياض",addressFr:"  "},"Fallback"),{storeName:"عربي",storeAddress:"الرياض"});
 assert.deepEqual(localize("en",{},"Fallback"),{storeName:"Fallback",storeAddress:""});
});

test("localized values reach header, hero, QR and address",()=>{
 assert.match(source,/<span>\{storeName\}<\/span>/);
 assert.match(source,/\{storeName\}<\/h1>/);
 assert.match(source,/<StorefrontQr slug=\{slug\} name=\{storeName\} language=\{language\}/);
 assert.match(source,/controls\.contact&&storeAddress&&/);
});
