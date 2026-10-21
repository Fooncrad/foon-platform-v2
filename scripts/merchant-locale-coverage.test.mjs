import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resourceModules} from "./restaurant-resource-schema.mjs";
import {uiCopy,uiText} from "../lib/i18n/ui-copy.ts";
import {missingResourceTranslations} from "../lib/i18n/resource-coverage.ts";

const sourceFile=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const arabic=/[\u0600-\u06FF]/u;
const translated=(value)=>!arabic.test(value)||Object.hasOwn(uiCopy,value);

test("every merchant resource field label has real English and French copy",()=>{
 const missing=[...new Set(Object.values(resourceModules).flatMap(module=>[module.label,...module.fields.map(field=>field.label)]).filter(value=>!translated(value)))];
 assert.deepEqual(missing,[],"Add missing values to lib/i18n/ui-copy.ts");
 for(const [arabicText,values] of Object.entries(uiCopy)){
  assert.equal(values.length,2,arabicText);
  for(const locale of ["en","fr"]){
   const translation=uiText(arabicText,locale);
   assert.ok(translation.trim()&&translation!==arabicText&&!arabic.test(translation),arabicText+" "+locale);
  }
 }
});

test("merchant action headings and source-literal translated UI text have complete copy",()=>{
 const merchant=sourceFile("app/restaurant/resource-manager.tsx");
 const workspace=sourceFile("app/restaurant/service-workspace.tsx");
 const actionBlock=merchant.slice(merchant.indexOf("const resourceActions:"),merchant.indexOf("export const operationLabels:"));
 const actions=[...actionBlock.matchAll(/(?:add|name|help):"([^"]+)"/g)].map(match=>match[1]);
 const missingActions=actions.filter(value=>!translated(value));
 assert.deepEqual(missingActions,[]);
 for(const [path,source] of [["resource-manager.tsx",merchant],["service-workspace.tsx",workspace]]){
  const values=[...source.matchAll(/\b(?:translateUi|uiText)\s*\(\s*"([^"]+)"/g)].map(match=>match[1]);
  const missing=[...new Set(values.filter(value=>!translated(value)))];
  assert.deepEqual(missing,[],path+" has missing English/French translations");
 }
});

test("translation audit identifies missing locales but never invents merchant wording",()=>{
 const fields=resourceModules.hotelRooms.fields;
 const record={name:"غرفة 101",data:{roomNumber:"101",nameEn:"Room 101",nameFr:null,hotelName:"فندق البحر",hotelNameEn:"Sea Hotel",hotelNameFr:""}};
 assert.deepEqual(missingResourceTranslations(record,fields),["nameFr","hotelNameFr"]);
 record.data.nameFr="Chambre 101";
 record.data.hotelNameFr="Hôtel de la mer";
 assert.deepEqual(missingResourceTranslations(record,fields),[]);
 const legacy={name:"قسم الصالة",data:{}};
 assert.deepEqual(missingResourceTranslations(legacy,resourceModules.sections.fields),["nameEn","nameFr"]);
 assert.deepEqual(missingResourceTranslations({name:"Point",data:{address:"Main street"}},resourceModules.pickupPoints.fields),["nameEn","nameFr","addressEn","addressFr"]);
});

test("editing a partial merchant form retains previously saved translations",()=>{
 const source=sourceFile("app/restaurant/resource-manager.tsx");
 assert.match(source,/data:Record<string,unknown>=editing\?\.data\?\{\.\.\.editing\.data\}:\{\}/);
 assert.match(source,/missingResourceTranslations\(row,config\.fields\)/);
 assert.match(source,/setMissingOnly/);
 const sections=sourceFile("app/restaurant/service-workspace.tsx");
 assert.match(sections,/untranslated=sections\.filter/);
 assert.match(sections,/nameEn:nameEn\.trim\(\)/);
 assert.match(sections,/nameFr:nameFr\.trim\(\)/);
});
