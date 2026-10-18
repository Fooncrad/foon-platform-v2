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

import {checkMariaDbTestGrants} from "./w08-mariadb-grants.mjs";

const grant=(value)=>({"Grants for test user":value});
const base=[
  grant("GRANT USAGE ON *.* TO \u0060foon_edge_runner\u0060@\u0060localhost\u0060 IDENTIFIED BY PASSWORD 'PLACEHOLDER_HASH'"),
  grant("GRANT ALL PRIVILEGES ON \u0060foon_edge_test\u0060.* TO \u0060foon_edge_runner\u0060@\u0060localhost\u0060")
];

test("W08 allows only MariaDB PUBLIC test fixture grants in read-only checks",()=>{
  const actual=checkMariaDbTestGrants([...base,
    grant("GRANT SELECT, INSERT, UPDATE, DELETE ON \u0060test\u0060.* TO PUBLIC"),
    grant("GRANT SELECT, INSERT, CREATE ON \u0060test\\_%\u0060.* TO PUBLIC")
  ]);
  assert.deepEqual(actual,{publicFixtureGrants:2});
});

test("W08 fails closed on non-fixture PUBLIC rights and elevated account privileges",()=>{
  const cases=[
    {extra:grant("GRANT ALL PRIVILEGES ON *.* TO \u0060foon_edge_runner\u0060@\u0060localhost\u0060"),error:"W08_ACCOUNT_HAS_GLOBAL_PRIVILEGES"},
    {extra:grant("GRANT ALL PRIVILEGES ON \u0060production\u0060.* TO \u0060foon_edge_runner\u0060@\u0060localhost\u0060"),error:"W08_ACCOUNT_HAS_OTHER_DATABASE_PRIVILEGES"},
    {extra:grant("GRANT SELECT ON \u0060production\u0060.* TO PUBLIC"),error:"W08_UNEXPECTED_PUBLIC_GRANT"},
    {extra:grant("GRANT ALL PRIVILEGES ON \u0060foon_edge_test\u0060.* TO PUBLIC"),error:"W08_UNEXPECTED_PUBLIC_GRANT"},
    {extra:grant("GRANT SELECT ON \u0060test_but_not_fixture\u0060.* TO PUBLIC"),error:"W08_UNEXPECTED_PUBLIC_GRANT"},
    {extra:grant("GRANT SELECT ON \u0060foon_edge_test\u0060.* TO \u0060unexpected\u0060@\u0060localhost\u0060"),error:"W08_UNEXPECTED_GRANT_RECIPIENT"}
  ];
  for(const {extra,error} of cases)
    assert.throws(()=>checkMariaDbTestGrants([...base,extra]),new RegExp(error));
  assert.throws(()=>checkMariaDbTestGrants([
    base[0],grant("GRANT SELECT ON \u0060foon_edge_test\u0060.* TO \u0060foon_edge_runner\u0060@\u0060localhost\u0060")
  ]),/W08_DATABASE_SCOPED_PRIVILEGES_REQUIRED/);
  assert.throws(()=>checkMariaDbTestGrants([]),/W08_UNRECOGNIZED_DB_GRANT/);
});
