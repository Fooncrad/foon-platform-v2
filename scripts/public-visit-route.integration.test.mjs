import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import vm from "node:vm";
import * as policy from "../lib/analytics/public-visits.ts";

const require=createRequire(import.meta.url);
const ts=require("typescript");
const load=path=>ts.transpileModule(readFileSync(new URL("../"+path,import.meta.url),"utf8"),{
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
}).outputText;
const postCode=load("app/api/analytics/visit/route.ts");
const getCode=load("app/api/analytics/stats/route.ts");
const tenant="123e4567-e89b-42d3-a456-426614174000";
const item="123e4567-e89b-42d3-a456-426614174001";
const creator="123e4567-e89b-42d3-a456-426614174002";

function fixture({actor=null,member=false,admin=false,published=true,creatorPublic=true}={}){
 const state={seen:new Set(),emails:[],writes:[],commands:[],visitorCookie:"",actor,member,admin,published,creatorPublic};
 const db={
  async execute(sql,args=[]){
   state.commands.push({sql,args});
   if(sql.includes("SELECT id FROM tenants"))return [[{id:tenant}]];
   if(sql.includes("FROM memberships WHERE tenant_id="))return [state.member?[{exists:1}]:[]];
   if(sql.includes("FROM platform_admins WHERE user_id="))return [state.admin?[{exists:1}]:[]];
   if(sql.includes("SELECT 1 FROM restaurant_menu_items")||sql.includes("SELECT 1 FROM catalog_products"))return [state.published?[{exists:1}]:[]];
   if(sql.includes("SELECT p.user_id FROM customer_creator_profiles"))return [state.creatorPublic?[{user_id:creator}]:[]];
   if(sql.startsWith("INSERT IGNORE INTO public_page_visits")){
    const key=JSON.stringify(args);
    const fresh=!state.seen.has(key);
    state.seen.add(key);
    state.writes.push(args);
    return [{affectedRows:fresh?1:0}];
   }
   if(sql.includes("SELECT 1 FROM memberships")&&sql.includes("role IN"))return [state.member?[{exists:1}]:[]];
   if(sql.includes("SELECT p.handle,p.visibility FROM customer_creator_profiles"))return [[{handle:"artist_test",visibility:"public"}]];
   if(sql.includes("SELECT COUNT(*) AS total"))return [[{total:state.seen.size,today:state.seen.size,last7:state.seen.size}]];
   if(sql.includes("SELECT item_id,kind,name,visits"))return [[{item_id:item,kind:"restaurant_item",name:"Coffee",visits:1}]];
   if(sql.includes("AS total")&&sql.includes("restaurant_menu_items"))return [[{total:1}]];
   throw Error("Unexpected query: "+sql.slice(0,130));
  }
 };
 const dependencies={
  "@/lib/db/mysql":{database:()=>db},
  "@/lib/auth/session":{currentUserId:async()=>state.actor},
  "@/lib/analytics/public-visits":policy,
  "@/lib/creator/profile-policy":{validCreatorHandle:handle=>/^[a-z0-9][a-z0-9_-]{2,38}[a-z0-9]$/.test(handle)},
  "next/server":{NextResponse:{json:(body,options={})=>({
   status:options.status??200,body,headers:options.headers??{},
   cookies:{set:(name,value,options)=>{state.visitorCookie=value;state.cookieDetails={name,options};}}
  })}}
 };
 const loadApi=code=>{
  const context={exports:{},require:name=>{
   if(!(name in dependencies))throw Error("Unexpected import "+name);
   return dependencies[name];
  },process:{env:{NODE_ENV:"production"}},console:{error:()=>{}},URLSearchParams,Date};
  vm.runInNewContext(code,context,{filename:"visit-analytics-transpiled.cjs"});
  return context.exports;
 };
 const post=loadApi(postCode),get=loadApi(getCode);
 const request=(body,{origin="https://example.test",site="same-origin",cookie=state.visitorCookie,userAgent="Mozilla/5.0 Chrome/155"}={})=>({
  nextUrl:{origin:"https://example.test",searchParams:new URLSearchParams()},
  headers:new Headers({"origin":origin,"sec-fetch-site":site,"user-agent":userAgent}),
  cookies:{get:()=>cookie?{value:cookie}:undefined},
  text:async()=>JSON.stringify(body)
 });
 const postVisit=(body,opts)=>post.POST(request(body,opts));
 const stats=async query=>get.GET({...request({}),nextUrl:{origin:"https://example.test",searchParams:new URLSearchParams(query)}});
 return {state,postVisit,stats};
}

test("a real store view is counted once per browser per Riyadh day",async()=>{
 const a=fixture();
 const first=await a.postVisit({kind:"storefront",slug:"nasserc"});
 assert.equal(first.status,200);
 assert.equal(first.body.recorded,true);
 assert.equal(a.state.cookieDetails.name,"foon_public_visit");
 assert.equal(a.state.cookieDetails.options.httpOnly,true);
 assert.equal(a.state.cookieDetails.options.sameSite,"lax");
 const again=await a.postVisit({kind:"storefront",slug:"nasserc"});
 assert.equal(again.body.recorded,false);
 assert.equal(a.state.seen.size,1);
});
test("a merchant or admin opening their own store must not inflate visits",async()=>{
 for(const options of [{actor:"owner",member:true},{actor:"administrator",admin:true}]){
  const a=fixture(options);
  assert.equal((await a.postVisit({kind:"storefront",slug:"nasserc"})).body.recorded,false);
  assert.equal(a.state.writes.length,0);
 }
});
test("a disabled product, invalid identifier, invalid origin or bot never counts",async()=>{
 const disabled=fixture({published:false});
 assert.equal((await disabled.postVisit({kind:"catalog_product",slug:"nasserc",id:item})).body.recorded,false);
 assert.equal(disabled.state.writes.length,0);
 const invalid=fixture();
 assert.equal((await invalid.postVisit({kind:"restaurant_item",slug:"nasserc",id:"NOT_UUID"})).status,400);
 assert.equal((await invalid.postVisit({kind:"storefront",slug:"nasserc"},{origin:"https://evil.test"})).status,403);
 assert.equal((await invalid.postVisit({kind:"storefront",slug:"nasserc"},{site:"cross-site"})).status,403);
 assert.equal((await invalid.postVisit({kind:"storefront",slug:"nasserc"},{userAgent:"Googlebot/2.1"})).body.recorded,false);
 assert.equal(invalid.state.writes.length,0);
});
test("a public creator profile is counted but its author or a private profile is excluded",async()=>{
 const a=fixture({actor:"customer"});
 assert.equal((await a.postVisit({kind:"creator_profile",handle:"artist_test"})).body.recorded,true);
 const author=fixture({actor:creator});
 assert.equal((await author.postVisit({kind:"creator_profile",handle:"artist_test"})).body.recorded,false);
 const privateProfile=fixture({creatorPublic:false});
 assert.equal((await privateProfile.postVisit({kind:"creator_profile",handle:"artist_test"})).body.recorded,false);
});
test("statistics stay private to a merchant member or the signed-in creator",async()=>{
 const guest=fixture();
 assert.equal((await guest.stats("tenant="+tenant)).status,401);
 const foreign=fixture({actor:"other-user",member:false});
 assert.equal((await foreign.stats("tenant="+tenant)).status,403);
 const owner=fixture({actor:"owner",member:true});
 const tenantMetrics=await owner.stats("tenant="+tenant);
 assert.equal(tenantMetrics.status,200);
 assert.equal(tenantMetrics.body.items[0].name,"Coffee");
 assert.equal(tenantMetrics.body.productCount,1);
 const creatorOwner=fixture({actor:creator});
 const profile=await creatorOwner.stats("scope=creator");
 assert.equal(profile.status,200);
 assert.equal(profile.body.profile.handle,"artist_test");
});
