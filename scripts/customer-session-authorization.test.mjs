import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

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
