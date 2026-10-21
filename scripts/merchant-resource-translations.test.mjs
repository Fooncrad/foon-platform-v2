import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resourceModules,validateResource} from "./restaurant-resource-schema.mjs";

const branch="11111111-1111-4111-8111-111111111111";
const sourceFile=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");

test("customer-facing merchant resources have English and French name fields",()=>{
 for(const module of ["departments","sections","inventory","suppliers","coupons","marketing","remote","remoteWorkers","hotelRooms","pickupPoints"]){
  const keys=resourceModules[module].fields.map(field=>field.key);
  assert.ok(keys.includes("nameEn"),module+" English");
  assert.ok(keys.includes("nameFr"),module+" French");
 }
 for(const module of ["categories","menu","menuGroups","menuValues"]){
  const keys=resourceModules[module].fields.map(field=>field.key);
  assert.ok(keys.includes("nameEn"),module+" existing English name remains");
  assert.ok(keys.includes("nameFr"),module+" existing French name remains");
 }
});

test("dining section translations round-trip while Arabic name remains authoritative",()=>{
 const body={name:"العائلات",status:"active",branchId:branch,data:{nameEn:"Families",nameFr:"Familles",description:"قسم عائلات",descriptionEn:"Family area",descriptionFr:"Espace familles"}};
 const result=validateResource("sections",body);
 assert.equal(result.name,"العائلات");
 assert.equal(result.data.nameEn,"Families");
 assert.equal(result.data.nameFr,"Familles");
 assert.equal(result.data.descriptionEn,"Family area");
 assert.equal(result.data.descriptionFr,"Espace familles");
 assert.equal(validateResource("sections",{...body,data:{}}).data.nameEn,null,"legacy Arabic-only records stay valid");
 assert.throws(()=>validateResource("sections",{...body,data:{nameEn:"x".repeat(181)}}),{code:"INVALID_nameEn"});
 assert.throws(()=>validateResource("sections",{...body,data:{nameFr:42}}),{code:"INVALID_nameFr"});
 assert.throws(()=>validateResource("sections",{...body,data:{unrecognizedName:"bad"}}),{code:"INVALID_INPUT"});
});

test("hotel and room labels are independently translatable and branch-scoped",()=>{
 const room=validateResource("hotelRooms",{name:"غرفة 101",status:"active",branchId:branch,data:{roomNumber:"a-101",nameEn:"Room 101",nameFr:"Chambre 101",hotelName:"فندق النخيل",hotelNameEn:"Palm Hotel",hotelNameFr:"Hôtel Palm"}});
 assert.equal(room.data.roomNumber,"A-101");
 assert.equal(room.data.hotelName,"فندق النخيل");
 assert.equal(room.data.hotelNameEn,"Palm Hotel");
 assert.equal(room.data.hotelNameFr,"Hôtel Palm");
 assert.equal(room.data.nameEn,"Room 101");
 assert.throws(()=>validateResource("hotelRooms",{name:"غرفة",status:"active",data:{roomNumber:"101",hotelNameEn:"Hotel"}}),{code:"REQUIRED_BRANCH"});
});

test("pickup point translated location and instructions stay optional and scoped",()=>{
 const point=validateResource("pickupPoints",{name:"البوابة الشمالية",status:"active",branchId:branch,data:{nameEn:"North gate",nameFr:"Porte nord",address:"شارع الملك",addressEn:"King St",addressFr:"Rue du Roi",instructions:"اذكر رقم الطلب",instructionsEn:"Mention your order number",instructionsFr:"Présentez votre numéro de commande"}});
 assert.equal(point.data.instructionsEn,"Mention your order number");
 assert.equal(point.data.instructionsFr,"Présentez votre numéro de commande");
 assert.equal(point.data.addressFr,"Rue du Roi");
 assert.throws(()=>validateResource("pickupPoints",{name:"Point",status:"active",data:{address:"Main St"}}),{code:"REQUIRED_BRANCH"});
});

test("merchant forms and public selectors use the translations with Arabic fallback",()=>{
 const sectionEditor=sourceFile("app/restaurant/service-workspace.tsx");
 const manager=sourceFile("app/restaurant/resource-manager.tsx");
 const publicMenu=sourceFile("lib/restaurant/public-menu.ts");
 const menuService=sourceFile("app/[slug]/menu-services.tsx");
 const pickupApi=sourceFile("app/api/customer/pickup-points/route.ts");
 const cart=sourceFile("app/[slug]/storefront-cart.tsx");
 for(const key of ["setNameEn","setNameFr","nameEn:nameEn.trim()","nameFr:nameFr.trim()"])assert.ok(sectionEditor.includes(key),key);
 assert.match(manager,/multilingualFields/);
 assert.match(manager,/localizedName\(row\)/);
 assert.match(publicMenu,/nameEn:String\(s\.data\.nameEn/);
 assert.match(menuService,/item\.nameEn\|\|item\.name/);
 assert.match(pickupApi,/instructionsEn:String\(data\.instructionsEn/);
 assert.match(cart,/point\.instructionsEn\|\|point\.instructions/);
});

test("all merchant resource labels have actual English and French UI translations",async()=>{
 const {uiCopy}=await import("../lib/i18n/ui-copy.ts");
 const labels=new Set(Object.values(resourceModules).flatMap(module=>[module.label,...module.fields.map(field=>field.label)]));
 const missing=[...labels].filter(label=>/[\\u0600-\\u06ff]/u.test(label)&&(!uiCopy[label]||uiCopy[label].length!==2||uiCopy[label].some(text=>!text.trim()||/[\\u0600-\\u06ff]/u.test(text))));
 assert.deepEqual(missing,[],`Untranslated resource labels: ${missing.join(", ")}`);
});
