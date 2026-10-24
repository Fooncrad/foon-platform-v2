import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
const require=createRequire(import.meta.url),ts=require("typescript");
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
const compile=path=>ts.transpileModule(read(path),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const tenant="123e4567-e89b-42d3-a456-426614174000",product="123e4567-e89b-42d3-a456-426614174001",creator="123e4567-e89b-42d3-a456-426614174002";
function fixture({actor=null,member=false,admin=false,creatorPublic=true,published=true}={}){
 const state={writes:[],cookies:[],seen:new Set(),actor,member,admin,creatorPublic,published};
 const db={async execute(sql,args=[]){
  if(sql.startsWith("SELECT id FROM tenants"))return [[{id:tenant}]];
  if(sql.includes("SELECT p.user_id FROM customer_creator_profiles"))return [state.creatorPublic?[{user_id:creator}]:[]];
  if(sql.includes("SELECT 1 FROM memberships WHERE tenant_id"))return [state.member?[{yes:1}]:[]];
  if(sql.includes("SELECT 1 FROM platform_admins WHERE user_id"))return [state.admin?[{yes:1}]:[]];
  if(sql.includes("SELECT 1 FROM restaurant_menu_items")||sql.includes("SELECT 1 FROM catalog_products"))return [state.published?[{yes:1}]:[]];
  if(sql.startsWith("INSERT IGNORE INTO public_visit_daily")){
   const key=JSON.stringify(args);
   state.writes.push(args);
   const fresh=!state.seen.has(key);state.seen.add(key);
   return [{affectedRows:fresh?1:0}];
  }
  if(sql.includes("SELECT p.handle,p.visibility FROM customer_creator_profiles"))return [[{handle:"artist_test",visibility:"public"}]];
  if(sql.includes("SELECT COUNT(*) AS total"))return [[{total:state.seen.size,today:state.seen.size,last7:state.seen.size}]];
  if(sql.includes("SELECT item_id,kind,name,visits"))return [[{item_id:product,kind:"restaurant_item",name:"Coffee",visits:3}]];
  if(sql.includes("(SELECT COUNT(*) FROM restaurant_menu_items"))return [[{total:1}]];
  throw Error("Unexpected SQL "+sql.slice(0,190));
 }};
 const env={AUTH_SECRET:"test-visits-secret",NODE_ENV:"test"};
 const evaluate=(path,dependencies)=>{const context={exports:{},require:name=>{
  if(!(name in dependencies))throw Error("Unexpected module "+name);return dependencies[name];
 },process:{env},console:{error:()=>{}},Date,URL,URLSearchParams,Headers};
 vm.runInNewContext(compile(path),context,{filename:path});
 return context.exports;
 };
 const analytics=evaluate("lib/analytics/public-visits.ts",{
  "node:crypto":require("node:crypto"),"@/lib/db/mysql":{database:()=>db}
 });
 const response={json:(data,options={})=>({status:options.status??200,data,
  cookies:{set:(name,value,opts)=>state.cookies.push({name,value,opts})}})};
 const deps={"next/server":{NextResponse:response},"@/lib/db/mysql":{database:()=>db},
  "@/lib/auth/session":{currentUserId:async()=>state.actor},
  "@/lib/analytics/public-visits":analytics};
 const visit=evaluate("app/api/public/visits/route.ts",deps);
 const stats=evaluate("app/api/analytics/stats/route.ts",deps);
 const request=(body,options={})=>{
  const origin=options.origin??"https://nfoodz.test",site=options.site??"same-origin";
  const url="https://nfoodz.test/api/public/visits";
  const params=new URLSearchParams();
  return {url,nextUrl:{origin:"https://nfoodz.test",searchParams:params},
   headers:new Headers({"origin":origin,"sec-fetch-site":site,"user-agent":options.agent??"Mozilla/5.0 Chrome/155"}),
   cookies:{get:()=>options.cookie?{value:options.cookie}:undefined},text:async()=>JSON.stringify(body)};
 };
 return {state,analytics,post:(body,opts)=>visit.POST(request(body,opts)),
  get:(params)=>stats.GET({...request({}),nextUrl:{origin:"https://nfoodz.test",searchParams:new URLSearchParams(params)}})};
}
test("one public storefront visit is deduplicated by an HttpOnly browser cookie",async()=>{
 const f=fixture();
 const first=await f.post({kind:"storefront",id:"nasserc"});
 assert.equal(first.status,200);
 assert.equal(f.state.writes.length,1);
 const set=f.state.cookies.at(-1);
 assert.equal(set.name,"foon_public_visit");
 assert.equal(set.opts.httpOnly,true);
 assert.equal(set.opts.sameSite,"lax");
 assert.equal(set.opts.maxAge,2592000);
 await f.post({kind:"storefront",id:"nasserc"},{cookie:set.value});
 assert.equal(f.state.seen.size,1);
});
test("fingerprints never depend on IP address, language or user agent",()=>{
 const f=fixture();
 const a=f.analytics.visitorFingerprint({headers:new Headers({"x-forwarded-for":"192.0.2.1"})},null,"123e4567-e89b-42d3-a456-426614174030");
 const b=f.analytics.visitorFingerprint({headers:new Headers({"x-forwarded-for":"198.51.100.9","user-agent":"Chrome"})},null,"123e4567-e89b-42d3-a456-426614174030");
 assert.equal(a,b);
 assert.match(a,/^[0-9a-f]{64}$/);
});
test("tenant owners and platform admins are not counted on their storefront",async()=>{
 for(const opts of [{actor:"owner",member:true},{actor:"admin",admin:true}]){
  const f=fixture(opts);
  assert.equal((await f.post({kind:"storefront",id:"nasserc"})).data.counted,false);
  assert.equal(f.state.writes.length,0);
 }
});
test("disabled product, cross-origin request, bots, and private creator profile do not count",async()=>{
 const f=fixture({published:false});
 assert.equal((await f.post({kind:"product",id:"nasserc",productId:product,source:"catalog"})).data.counted,false);
 assert.equal((await f.post({kind:"storefront",id:"nasserc"},{origin:"https://wrong.test"})).status,403);
 assert.equal((await f.post({kind:"storefront",id:"nasserc"},{site:"cross-site"})).status,403);
 assert.equal((await f.post({kind:"storefront",id:"nasserc"},{agent:"Googlebot"})).data.counted,false);
 assert.equal(f.state.writes.length,0);
 const hidden=fixture({creatorPublic:false});
 assert.equal((await hidden.post({kind:"profile",id:creator})).data.counted,false);
 assert.equal(hidden.state.writes.length,0);
 const own=fixture({actor:creator});
 assert.equal((await own.post({kind:"profile",id:creator})).data.counted,false);
});
test("only an authorized tenant manager can see product counts; profile owner sees their own profile",async()=>{
 const guest=fixture();
 assert.equal((await guest.get("tenant="+tenant)).status,401);
 const foreign=fixture({actor:"other",member:false});
 assert.equal((await foreign.get("tenant="+tenant)).status,403);
 const owner=fixture({actor:"owner",member:true});
 const stats=await owner.get("tenant="+tenant);
 assert.equal(stats.status,200);
 assert.equal(stats.data.items[0].views,3);
 assert.equal(stats.data.productCount,1);
 const profileOwner=fixture({actor:creator});
 const profile=await profileOwner.get("scope=creator");
 assert.equal(profile.status,200);
 assert.equal(profile.data.profile.handle,"artist_test");
});
test("all public surfaces and account panels use the same existing 0210 analytics table",()=>{
 const source=read("app/api/public/visits/route.ts"),summary=read("app/api/analytics/stats/route.ts");
 assert.match(source,/p.visibility='public'/);
 assert.match(source,/c.enabled=TRUE/);
 assert.match(source,/source==="restaurant"/);
 assert.match(summary,/public_visit_daily/);
 assert.match(read("app/[slug]/public-visit-tracker.tsx"),/PublicVisitTracker/);
 assert.match(read("app/[slug]/public-menu.tsx"),/recordProductDetailsVisit\("restaurant"/);
 assert.match(read("app/[slug]/activity-product-details.tsx"),/recordProductDetailsVisit\("catalog"/);
 assert.match(read("app/creators/[handle]/page.tsx"),/<PublicVisitTracker kind="profile"/);
 assert.match(read("app/restaurant/merchant-dashboard.tsx"),/<MerchantVisitStats/);
 assert.match(read("app/customer/page.tsx"),/<CreatorProfileVisitStats\/>/);
 assert.match(read("app/customer/creator/creator-editor.tsx"),/<CreatorProfileVisitStats/);
 assert.match(read("migrations/0210_public_visit_analytics.sql"),/CREATE TABLE IF NOT EXISTS public_visit_daily/);
});
