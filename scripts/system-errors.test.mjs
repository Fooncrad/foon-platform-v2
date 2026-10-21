import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {systemStatusMessages,systemStatusFromHttp,systemLocale,localizedSystemStatus} from "../lib/platform/system-status-copy.ts";
const file=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("all system error and maintenance pages have complete AR EN FR text",()=>{
 for(const language of ["ar","en","fr"])for(const status of ["NOT_FOUND","SERVER_ERROR","BAD_GATEWAY","SERVICE_UNAVAILABLE","GATEWAY_TIMEOUT","MAINTENANCE"]){
  const value=systemStatusMessages[language][status];
  for(const key of ["title","description","retry","home","reference","status","support"])assert.ok(value[key].length>3,language+"/"+status+"/"+key);
 }
 assert.equal(systemLocale("en-US"),"en");assert.equal(systemLocale("fr-FR"),"fr");assert.equal(systemLocale("ar-SA"),"ar");
 assert.equal(systemStatusFromHttp(404),"NOT_FOUND");assert.equal(systemStatusFromHttp(502),"BAD_GATEWAY");assert.equal(systemStatusFromHttp(503),"SERVICE_UNAVAILABLE");assert.equal(systemStatusFromHttp(504),"GATEWAY_TIMEOUT");assert.equal(systemStatusFromHttp(500),"SERVER_ERROR");
 assert.match(localizedSystemStatus("ar","GATEWAY_TIMEOUT").description,/تحقق من حالتها/);
});
test("global and route-level errors display digest or report browser-only reference",()=>{
 const ui=file("app/system-status-screen.tsx");
 assert.match(file("app/global-error.tsx"),/SystemStatusScreen/);
 assert.match(file("app/error.tsx"),/SystemStatusScreen/);
 assert.match(file("app/not-found.tsx"),/NOT_FOUND/);
 assert.match(file("app/admin/translations/error.tsx"),/SystemStatusScreen/);
 assert.match(ui,/error\?\.digest/);
 assert.match(ui,/crypto\.getRandomValues/);
 assert.match(ui,/\/api\/system\/client-incident/);
 assert.match(ui,/data-testid="incident-reference"/);
 assert.match(file("instrumentation.ts"),/onRequestError/);
 assert.ok(!file("instrumentation.ts").includes("_request.path"),"never log raw URLs");
});
test("client incident endpoint rejects attacker-controlled details",()=>{
 const route=file("app/api/system/client-incident/route.ts");
 assert.match(route,/assertSameOrigin/);
 assert.match(route,/^WEB-\[A-F0-9\]/m);
 assert.match(route,/\["app-error","global-error"\]/);
 assert.match(route,/logIncident/);
 assert.doesNotMatch(route,/body\?\.stack|body\?\.message|body\?\.url/);
});
test("planned maintenance serves 503 without intercepting APIs and does not claim nginx 504 interception",()=>{
 const proxy=file("proxy.ts"),staticHtml=file("public/maintenance.html"),docs=file("docs/foon-maintenance-errors-runbook.md");
 assert.match(proxy,/FOON_MAINTENANCE_MODE/);
 assert.match(proxy,/status:503/);
 assert.match(proxy,/Retry-After/);
 assert.match(proxy,/pathname\.startsWith\("\/api\/"\)/);
 assert.match(proxy,/\["GET","HEAD"\]/);
 assert.match(staticHtml,/data-lang="ar"/);
 assert.match(staticHtml,/data-lang="en"/);
 assert.match(staticHtml,/data-lang="fr"/);
 assert.match(staticHtml,/noindex/);
 assert.match(docs,/nginx/);
 assert.match(docs,/not only/);
 assert.match(file("app/maintenance/page.tsx"),/MAINTENANCE/);
});
test("restaurant operations and health failures share reference IDs with server logs",()=>{
 const operations=file("app/api/restaurant/operations/[module]/route.ts"),health=file("app/api/health/route.ts");
 for(const src of [operations,health]){
  assert.match(src,/X-Foon-Incident-Id/);
  assert.match(src,/Content-Language/);
  assert.match(src,/logIncident/);
 }
 assert.match(operations,/return NextResponse\.json\(\{ok:false,code,message,incidentId,status\}/);
 assert.match(operations,/normalizeLocale/);
 assert.match(health,/code:"DATABASE_UNAVAILABLE"/);
});
