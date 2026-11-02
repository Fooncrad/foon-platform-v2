import sharp from "sharp";
import assert from "node:assert/strict";
export async function runCatalogImageChecks({db,call,owner,product,foreign}){
 const path="/api/restaurant/activity-catalog/images";
 const api=(method,body)=>call(path,method,{product,...body},owner.cookie,owner.tenant);
 const read=()=>call(path+"?product="+product,"GET",undefined,owner.cookie,owner.tenant);
 assert.equal((await call(path+"?product="+product,"GET",undefined,foreign.cookie,foreign.tenant)).status,404);
 const fixture=await sharp({create:{width:1200,height:600,channels:3,background:"#e2a93b"}}).png().toBuffer();
 const upload=async(file=new Blob([fixture],{type:"image/png"}),cookie=owner.cookie)=>{
  const form=new FormData();form.set("product",product);form.set("file",file,"photo.png");
  const r=await fetch("http://localhost:3103"+path,{method:"POST",headers:{cookie,origin:"http://localhost:3103","x-foon-tenant":owner.tenant},body:form});return {status:r.status,body:await r.json()};
 };
 assert.equal((await upload(new Blob(["not a png"],{type:"image/png"}))).status,400);
 assert.equal((await upload(undefined,foreign.cookie)).status,403);
 const uploaded=await upload();assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
 let images=(await read()).body.images;assert.equal(images.length,1);assert.match(images[0].image_url,/^\/api\/restaurant\/assets\//);
 const served=await fetch("http://localhost:3103"+images[0].image_url);assert.equal(served.status,200);assert.equal(served.headers.get("content-type"),"image/jpeg");
 const metadata=await sharp(Buffer.from(await served.arrayBuffer())).metadata();assert.equal(metadata.width,800);assert.equal(metadata.height,800);
 for(let i=0;i<2;i++)assert.equal((await api("POST",{url:"https://example.com/image"+i+".png"})).status,201);
 const race=await Promise.all([upload(),upload()]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);assert.equal(race.find(r=>r.status===409).body.code,"IMAGE_LIMIT_REACHED");
 images=(await read()).body.images;assert.equal(images.length,4);
 const [[assets]]=await db.execute("SELECT COUNT(*) AS n FROM restaurant_assets WHERE tenant_id=?",[owner.tenant]);assert.equal(Number(assets.n),2,"rejected upload creates no orphan asset");
 const reversed=images.map(i=>i.id).reverse();assert.equal((await api("PATCH",{ids:reversed})).status,200);
 assert.deepEqual((await read()).body.images.map(i=>i.id),reversed);
 assert.equal((await api("PATCH",{ids:reversed.slice(1)})).status,400);
 assert.equal((await api("PATCH",{ids:[...reversed.slice(0,3),reversed[0]]})).status,400);
 assert.equal((await api("DELETE",{id:reversed[0]})).status,200);
 assert.equal((await api("DELETE",{id:reversed[0]})).status,404);
 const remaining=(await read()).body.images;assert.deepEqual(remaining.map(i=>Number(i.sort_order)),[0,1,2]);
 assert.equal((await api("POST",{url:"https://example.com/replacement.png"})).status,201);
 assert.equal((await api("POST",{url:"http://example.com/insecure.png"})).status,400);
 console.info("Catalog images: uploads, four-image race cap, primary/reorder/delete, tenant isolation and asset rollback verified");
}
