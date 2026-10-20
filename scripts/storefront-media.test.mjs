import test from "node:test";
import assert from "node:assert/strict";
import {buildStorefrontGalleries} from "../lib/catalog/storefront-media.ts";
test("product galleries expose ordered four images and cover fallback",()=>{
 const gallery=buildStorefrontGalleries([{id:"p1",image_url:"cover.jpg"},{id:"p2",image_url:"fallback.jpg"}],
  Array.from({length:6},(_,i)=>({product_id:"p1",image_url:"photo"+i+".jpg"})),[]);
 assert.deepEqual(gallery.p1.images,["photo0.jpg","photo1.jpg","photo2.jpg","photo3.jpg"]);
 assert.deepEqual(gallery.p2.images,["fallback.jpg"]);
});
test("variant images never override product cover or cross to unrelated products",()=>{
 const gallery=buildStorefrontGalleries([{id:"own",image_url:"main.jpg"}],
  [{product_id:"other",image_url:"other.jpg"}],
  [{product_id:"other",variant_id:"leak",sku:"X",image_url:"secret.jpg"},{product_id:"own",variant_id:"red",sku:"RED",image_url:"red1.jpg"},{product_id:"own",variant_id:"red",sku:"RED",image_url:"red2.jpg"}]);
 assert.deepEqual(Object.keys(gallery),["own"]);
 assert.deepEqual(gallery.own.images,["main.jpg"]);
 assert.deepEqual(gallery.own.variants,[{id:"red",sku:"RED",images:["red1.jpg","red2.jpg"]}]);
});
test("at most four variants and four images per variant are displayed",()=>{
 const variants=Array.from({length:6},(_,v)=>Array.from({length:6},(_,n)=>({product_id:"p",variant_id:"v"+v,image_url:"v"+v+"-"+n}))).flat();
 const result=buildStorefrontGalleries([{id:"p"}],[],variants);
 assert.equal(result.p.variants.length,4);
 assert(result.p.variants.every(v=>v.images.length===4));
});
