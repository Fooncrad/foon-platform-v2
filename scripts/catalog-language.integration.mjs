import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
test("catalog descriptions round-trip in three languages and remain tenant isolated",async()=>{
 const database=new URL(process.env.DATABASE_URL??"");
 assert.equal(database.hostname,"127.0.0.1");assert.equal(database.pathname,"/foon_migration_test");
 const origin="http://127.0.0.1:3116";
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3116"],{env:{...process.env,APP_URL:origin},stdio:"ignore"});
 const call=async(method,body,owner,path="/api/restaurant/activity-catalog")=>{
  const r=await fetch(origin+path,{method,headers:{origin,"content-type":"application/json",...(owner?{cookie:owner.cookie,"x-foon-tenant":owner.tenant}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json(),cookie:r.headers.get("set-cookie")?.split(";")[0]};
 };
 const register=async()=>{const slug="lang-"+randomUUID().slice(0,12);const r=await call("POST",{name:slug,storeName:slug,slug,email:slug+"@test.example",password:"a-strong-test-password",kind:"restaurant",activity:"clothing",countryCode:"SA",currency:"SAR",region:"الرياض"},null,"/api/auth/register");assert.equal(r.status,201,JSON.stringify(r.body));return {tenant:r.body.tenant.id,cookie:r.cookie,slug};};
 try{
  let ready=false;for(let i=0;i<100;i++){try{await fetch(origin+"/login");ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready);
  const owner=await register(),other=await register();
  const descriptions={description:"وصف عربي",descriptionEn:"English description",descriptionFr:"Description française"};
  const category=await call("POST",{kind:"category",name:"قسم جديد",nameEn:"Category",nameFr:"Catégorie",...descriptions},owner);assert.equal(category.status,201);
  const product=await call("POST",{kind:"product",categoryId:category.body.id,name:"منتج جديد",nameEn:"Product",nameFr:"Produit",price:12.50,...descriptions},owner);assert.equal(product.status,201);
  const result=await call("GET",null,owner);assert.equal(result.status,200);
  for(const item of [result.body.categories.find(c=>c.id===category.body.id),result.body.products.find(p=>p.id===product.body.id)]){assert.equal(item.description_ar,descriptions.description);assert.equal(item.description_en,descriptions.descriptionEn);assert.equal(item.description_fr,descriptions.descriptionFr);}
  for(const kind of ["product","category"]){const id=kind==="product"?product.body.id:category.body.id;
   assert.equal((await call("PATCH",{kind,id,descriptionEn:"Updated English",descriptionFr:""},owner)).status,200);
   assert.equal((await call("PATCH",{kind,id,descriptionEn:"Intrusion"},other)).status,404);
   assert.equal((await call("PATCH",{kind,id,descriptionFr:42},owner)).status,400);
  }
  const final=await call("GET",null,owner);assert.equal(final.body.products.find(p=>p.id===product.body.id).description_en,"Updated English");
 }finally{server.kill("SIGTERM");}
});
