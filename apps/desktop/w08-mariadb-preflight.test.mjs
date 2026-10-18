// No database connections in these tests: disallowed connection strings
// must be rejected before mysql2 attempts to connect.
import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {resolve,dirname,join} from "node:path";
import {fileURLToPath} from "node:url";

const script=join(dirname(fileURLToPath(import.meta.url)),"w08-mariadb-readonly-preflight.mjs");
function probe(url){
 return spawnSync(process.execPath,[script],{
  encoding:"utf8",timeout:5000,
  env:{...process.env,EDGE_TEST_DATABASE_URL:url}
 });
}
test("W08 read-only MariaDB preflight rejects every nonlocal or privileged target before connection",()=>{
 const urls=[
  "",
  "mysql://root:test@127.0.0.1:3306/foon_edge_test",
  "mysql://worker:test@localhost:3306/foon_edge_test",
  "mysql://worker:test@192.168.1.4:3306/foon_edge_test",
  "mysql://worker:test@127.0.0.1:3306/foon_v2_test",
  "mysql://worker:test@127.0.0.1:3306/production",
  "mysql://worker:test@127.0.0.1:3307/foon_edge_test",
  "mysql://worker:test@127.0.0.1:3306/foon_edge_test?multipleStatements=true",
  "mysql://worker:test@127.0.0.1:3306/foon_edge_test#fragment",
  "https://worker:test@127.0.0.1:3306/foon_edge_test"
 ];
 for(const url of urls){
  const r=probe(url);
  assert.notEqual(r.status,0,"must reject "+url.split("@").pop());
  assert.match(r.stderr,/W08_(TEST_URL_REQUIRED|REJECT_NONLOCAL_OR_NONTEST_DATABASE)/);
  assert.equal(r.stdout,"");
 }
});
