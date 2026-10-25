import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

// Execute the actual route bodies with only TypeScript annotations and imports removed.
// This is an isolated policy test, not an HTTP or database integration test.
function loadRoute(path,context,names){
 const source=readFileSync(new URL("../"+path,import.meta.url),"utf8");
 const executable=source.replace(/^import .*\n/gm,"")
  .replaceAll("execute<RowDataPacket[]>","execute")
  .replace("change(request:Request,remove:boolean)","change(request,remove)")
  .replaceAll("GET(request:Request)","GET(request)")
  .replaceAll("POST(request:Request)","POST(request)")
  .replaceAll("DELETE(request:Request)","DELETE(request)")
  .replaceAll("export async function ","async function ")
  .replaceAll("export const ","const ");
 return runInNewContext(executable+"\n({"+names+"})",context);
}
function harness(kind,{active=true,employee=false,session=true,dbError=false}={}){
 const queries=[];
 const database=()=>({execute:async(sql)=>{
  queries.push(sql);
  if(dbError)throw Error("DATABASE_DOWN");
  if(sql.includes("FROM users WHERE"))return [active?[{id:"customer-a"}]:[]];
  if(kind==="favorites")return [[{tenant_id:"shop-a"}]];
  return [[{id:"campaign-a"}]];
 }});
 const context={
  database,URL,NextResponse:{json:(body,opts={})=>({body,status:opts.status??200})},
  employeePersonalAccessDenied:async()=>employee?{status:403}:null,
  currentUserId:async()=>session?"customer-a":null,
  assertSameOrigin:()=>{}
 };
 const path=kind==="favorites"?"app/api/customer/favorite-stores/route.ts":"app/api/customer/growth-offers/route.ts";
 return {api:loadRoute(path,context,kind==="favorites"?"GET,POST,DELETE":"GET"),queries};
}
const request={url:"https://example.test/api/customer/growth-offers?tenantId=12345678-1234-1234-1234-123456789012",json:async()=>({tenantId:"12345678-1234-1234-1234-123456789012"})};
test("frozen customer cannot read saved stores",async()=>{
 const {api,queries}=harness("favorites",{active:false});
 assert.equal((await api.GET()).status,401);
 assert.equal(queries.length,1);
});
test("frozen customer cannot modify saved stores",async()=>{
 const {api,queries}=harness("favorites",{active:false});
 assert.equal((await api.POST(request)).status,401);
 assert.equal((await api.DELETE(request)).status,401);
 assert.equal(queries.length,2);
});
test("active customer can read only their linked saved stores",async()=>{
 const {api,queries}=harness("favorites");
 const response=await api.GET();
 assert.equal(response.status,200);
 assert.deepEqual(Array.from(response.body.tenantIds),["shop-a"]);
 assert.match(queries[1],/f\.user_id=\?/);
});
test("saved-store status lookup fails closed on database errors",async()=>{
 const {api}=harness("favorites",{dbError:true});
 assert.equal((await api.GET()).status,503);
});
test("frozen customer cannot read private growth offers",async()=>{
 const {api,queries}=harness("offers",{active:false});
 assert.equal((await api.GET(request)).status,401);
 assert.equal(queries.length,1);
});
test("active customer can read only linked active offers",async()=>{
 const {api,queries}=harness("offers");
 assert.equal((await api.GET(request)).status,200);
 assert.match(queries[1],/tc\.user_id=\?/);
});
test("growth-offer status lookup fails closed on database errors",async()=>{
 const {api}=harness("offers",{dbError:true});
 assert.equal((await api.GET(request)).status,503);
});
test("staff and unauthenticated sessions are denied before private queries",async()=>{
 for(const kind of ["favorites","offers"]){
  for(const options of [{employee:true},{session:false}]){
   const {api,queries}=harness(kind,options);
   const response=await api.GET(kind==="offers"?request:undefined);
   assert.equal(response.status,options.employee?403:401);
   assert.equal(queries.length,0);
  }
 }
});
