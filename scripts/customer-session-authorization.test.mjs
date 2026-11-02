import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const route=readFileSync(new URL("../app/api/customer/security/sessions/route.ts",import.meta.url),"utf8");
const access=route.split("async function access()")[1]?.split("export async function GET()")[0]??"";

test("session access keeps employee and valid-session gates",()=>{
 assert.match(access,/employeePersonalAccessDenied\(\)/);
 assert.match(access,/currentUserId\(\),sessionId=await currentSessionId\(\)/);
 assert.match(access,/if\(!userId\|\|!sessionId\)return \{error:fail\("UNAUTHENTICATED",401\)\}/);
});

test("inactive or deleted customer accounts cannot manage sessions",()=>{
 assert.match(access,/SELECT id FROM users WHERE id=\? AND status='active' LIMIT 1/);
 assert.match(access,/\[userId\]/);
 assert.match(access,/if\(!users\.length\)return \{error:fail\("UNAUTHENTICATED",401\)\}/);
 assert.ok(access.indexOf("if(!users.length)")<access.lastIndexOf("return {userId,sessionId}"));
});

test("user status lookup fails closed when database is unavailable",()=>{
 assert.match(access,/catch\{return \{error:fail\("SESSIONS_UNAVAILABLE",503\)\};\}/);
});

test("both session endpoints enforce the guard and revocation stays user scoped",()=>{
 const get=route.split("export async function GET()")[1]?.split("export async function DELETE(")[0]??"";
 const del=route.split("export async function DELETE(")[1]??"";
 assert.match(get,/await access\(\)/);
 assert.match(del,/assertSameOrigin\(request\)/);
 assert.match(del,/await access\(\)/);
 assert.match(route,/DELETE FROM auth_sessions WHERE user_id=\? AND id<>\?/);
 assert.match(route,/DELETE FROM auth_sessions WHERE user_id=\? AND id=\? AND id<>\?/);
});

/**
 * Exercise the real access() body from the TypeScript route with mocked I/O.
 * Strip only the TypeScript return annotation and the query type parameter.
 * These are isolated policy tests, not HTTP or MariaDB integration tests.
 */
const executableAccess=("async function access()"+access)
 .replace(/^async function access\(\):Promise<[^\n]+>\{/,"async function access(){")
 .replaceAll("execute<RowDataPacket[]>","execute");
function accessHarness({active=true,employee=false,session=true,dbError=false}={}){
 const calls=[];
 const fail=(code,status)=>({code,status});
 const db={execute:async(sql,params)=>{
  calls.push({sql,params});
  if(dbError)throw Error("DB_OFFLINE");
  return [active?[{id:"customer-a"}]:[]];
 }};
 const fn=runInNewContext(executableAccess+"\naccess",{
  employeePersonalAccessDenied:async()=>employee?{status:403}:null,
  currentUserId:async()=>"customer-a",
  currentSessionId:async()=>session?"session-a":null,
  database:()=>db,fail
 });
 return {fn,calls};
}
test("active customer can list own sessions after account-status lookup",async()=>{
 const {fn,calls}=accessHarness();
 const result=await fn();
 assert.equal(result.userId,"customer-a");
 assert.equal(result.sessionId,"session-a");
 assert.equal(calls.length,1);
 assert.deepEqual(Array.from(calls[0].params),["customer-a"]);
});
test("frozen customer with still-valid cookie is rejected",async()=>{
 const {fn}=accessHarness({active:false});
 assert.equal((await fn()).error.code,"UNAUTHENTICATED");
});
test("account-status database failure denies access without exposing data",async()=>{
 const {fn}=accessHarness({dbError:true});
 assert.equal((await fn()).error.status,503);
});
test("employees and missing sessions are rejected before account query",async()=>{
 for(const opts of [{employee:true},{session:false}]){
  const {fn,calls}=accessHarness(opts);
  const result=await fn();
  assert.ok(result.error);
  assert.equal(calls.length,0);
 }
});
