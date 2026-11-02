import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import sharp from "sharp";
import mysql from "mysql2/promise";
test("catalog descriptions round-trip in three languages and remain tenant isolated",async()=>{
 const database=new URL(process.env.DATABASE_URL??"");
 assert.equal(database.hostname,"127.0.0.1");assert.equal(database.pathname,"/foon_migration_test");
 const origin="http://127.0.0.1:3116";
 const server=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-H","127.0.0.1","-p","3116"],{env:{...process.env,APP_URL:origin},stdio:"ignore"});
 const call=async(method,body,owner,path="/api/restaurant/activity-catalog")=>{
  const r=await fetch(origin+path,{method,headers:{origin,"content-type":"application/json",...(owner?{cookie:owner.cookie,"x-foon-tenant":owner.tenant}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:r.status,body:await r.json(),cookie:r.headers.get("set-cookie")?.split(";")[0]};
 };
 const register=async()=>{const slug="lang-"+randomUUID().slice(0,12);const r=await call("POST",{name:slug,storeName:slug,slug,email:slug+"@test.example",password:"a-strong-test-password",kind:"restaurant",activity:"clothing",countryCode:"SA",currency:"SAR",region:"الرياض",legalAccepted:true},null,"/api/auth/register");assert.equal(r.status,201,JSON.stringify(r.body));return {tenant:r.body.tenant.id,cookie:r.cookie,slug};};
 try{
  let ready=false;for(let i=0;i<100;i++){try{await fetch(origin+"/login");ready=true;break;}catch{await new Promise(r=>setTimeout(r,200));}}assert.ok(ready);
  const owner=await register(),other=await register();
  const db=await mysql.createConnection(process.env.DATABASE_URL);
  const ownAsset=randomUUID(),foreignAsset=randomUUID();
  try{const plan=randomUUID();await db.execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,?,?,?)",[plan,"test-"+plan,"اختبار","Test","Test"]);for(const key of ["branding.colors","digital_menu","branding.logo"]){await db.execute("INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category) VALUES (?,?,?,?)",[key,key,key,"test"]);await db.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled) VALUES (?,?,TRUE)",[plan,key]);}await db.execute("UPDATE tenant_subscriptions SET plan_id=? WHERE tenant_id=?",[plan,owner.tenant]);for(const [id,tenant] of [[ownAsset,owner.tenant],[foreignAsset,other.tenant]])await db.execute("INSERT INTO restaurant_assets(id,tenant_id,mime_type,bytes,size_bytes) VALUES (?,?,?, ?,?)",[id,tenant,"image/png",Buffer.from([137,80,78,71,13,10,26,10]),8]);}finally{await db.end();}
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
  assert.equal((await call("PATCH",{kind:"category",id:category.body.id,imageUrl:"/api/restaurant/assets/"+foreignAsset},owner)).status,400);
  assert.equal((await call("PATCH",{kind:"category",id:category.body.id,imageUrl:"javascript:alert(1)"},owner)).status,400);
  assert.equal((await call("PATCH",{kind:"category",id:category.body.id,imageUrl:"/api/restaurant/assets/"+ownAsset},owner)).status,200);
  const withImage=await call("GET",null,owner);assert.equal(withImage.body.categories.find(c=>c.id===category.body.id).image_url,"/api/restaurant/assets/"+ownAsset);
  assert.equal((await call("PATCH",{kind:"category",id:category.body.id,imageUrl:null},owner)).status,200);
  const upload=new FormData();upload.set("file",new Blob([await sharp({create:{width:200,height:100,channels:3,background:"#e2a93b"}}).png().toBuffer()],{type:"image/png"}),"category.png");
  const uploaded=await fetch(origin+"/api/restaurant/assets",{method:"POST",headers:{origin,cookie:owner.cookie,"x-foon-tenant":owner.tenant},body:upload});assert.equal(uploaded.status,201);const uploadedImage=await uploaded.json();
  assert.equal((await call("PATCH",{kind:"category",id:category.body.id,imageUrl:uploadedImage.url},owner)).status,200);
  const publicPage=await fetch(origin+"/"+owner.slug,{headers:{cookie:"foon_language=en"}});assert.equal(publicPage.status,200);const publicHtml=await publicPage.text();assert.ok(publicHtml.includes(uploadedImage.url));assert.ok(publicHtml.includes("Updated English"));
  const policy=await call("POST",{name:"Business identity",status:"active",data:{terms:"شروط المتجر",termsEn:"Store terms <script>window.bad=true</script>",termsFr:"Conditions du magasin",refund:"سياسة الاسترجاع",mapUrl:"https://maps.google.com/?q=Riyadh",instagramUrl:"https://instagram.com/example"}},owner,"/api/restaurant/operations/storefront");
  assert.equal(policy.status,201,JSON.stringify(policy.body));
  const english=await fetch(origin+"/"+owner.slug+"/policies/terms",{headers:{cookie:"foon_language=en"}});assert.equal(english.status,200);const html=await english.text();assert.ok(html.includes("Store terms"));assert.ok(html.includes("&lt;script&gt;"));
  const otherPolicy=await fetch(origin+"/"+other.slug+"/policies/terms");assert.equal(otherPolicy.status,404);
  const missingTranslation=await fetch(origin+"/"+owner.slug+"/policies/refund",{headers:{cookie:"foon_language=en"}});assert.equal(missingTranslation.status,404);
  const final=await call("GET",null,owner);assert.equal(final.body.products.find(p=>p.id===product.body.id).description_en,"Updated English");
 }finally{server.kill("SIGTERM");}
});
