// W10 pure safety tests. DO NOT CONNECT TO MARIA DB.
import test from "node:test";
import assert from "node:assert/strict";
import {w10LocalUrl,checkW10InitialState,W10_ORDERS_SQL} from "./w10-http-mariadb-guard.mjs";

const tick=String.fromCharCode(96);
const account=tick+"foon_edge_runner"+tick+"@"+tick+"localhost"+tick;
const grant=value=>({grant:value});
const grants=[
  grant("GRANT USAGE ON *.* TO "+account),
  grant("GRANT ALL PRIVILEGES ON "+tick+"foon_edge_test"+tick+".* TO "+account),
  grant("GRANT SELECT, INSERT, CREATE ON "+tick+"test"+tick+".* TO PUBLIC"),
  grant("GRANT SELECT, INSERT, CREATE ON "+tick+"test\\_%"+tick+".* TO PUBLIC")
];
const identity={dbname:"foon_edge_test",port:3306,account:"foon_edge_runner@localhost"};
const tables=[{TABLE_NAME:"edge_sync_inbox"},{TABLE_NAME:"w08_fixture_orders"}];
const counts={inbox:4,orders:4};

test("W10 blocks remote, root, different schemas, query strings and alternate users",()=>{
  const base="mysql://foon_edge_runner:private@127.0.0.1:3306/foon_edge_test";
  assert.equal(w10LocalUrl(base),base);
  for(const bad of [
    undefined,"",base.replace("127.0.0.1","localhost"),
    base.replace("127.0.0.1","192.168.1.2"),
    base.replace("foon_edge_runner","root"),
    base.replace("/foon_edge_test","/production"),
    base.replace(":3306",":3307"),
    base+"?multipleStatements=true",base+"#frag"
  ])assert.throws(()=>w10LocalUrl(bad),/W10_/);
});

test("W10 accepts ONLY W08 4+4, exactly two known existing tables and scoped account",()=>{
  assert.deepEqual(checkW10InitialState(identity,grants,tables,counts),{publicFixtureGrants:2});
  for(const names of [
    [],[{TABLE_NAME:"edge_sync_inbox"}],
    [...tables,{TABLE_NAME:"w10_http_fixture_orders"}],
    [{TABLE_NAME:"production"},{TABLE_NAME:"w08_fixture_orders"}]
  ])assert.throws(()=>checkW10InitialState(identity,grants,names,counts),/W10_UNEXPECTED_SCHEMA_REFUSE_WRITE/);
  for(const changed of [{inbox:5,orders:4},{inbox:4,orders:0}])
    assert.throws(()=>checkW10InitialState(identity,grants,tables,changed),/W10_W08_BASELINE_COUNTS_CHANGED/);
  assert.throws(()=>checkW10InitialState({...identity,account:"root@localhost"},grants,tables,counts),/W10_UNEXPECTED_MYSQL_IDENTITY/);
  assert.throws(()=>checkW10InitialState({...identity,dbname:"foon_v2_test"},grants,tables,counts),/W10_UNEXPECTED_MYSQL_IDENTITY/);
  assert.throws(()=>checkW10InitialState(identity,[...grants,grant("GRANT UPDATE ON production.* TO "+account)],tables,counts),/W08_ACCOUNT_HAS_OTHER_DATABASE_PRIVILEGES/);
  assert.throws(()=>checkW10InitialState(identity,[...grants,grant("GRANT INSERT ON *.* TO "+account)],tables,counts),/W08_ACCOUNT_HAS_GLOBAL_PRIVILEGES/);
});

test("W10 fixture SQL is exactly a single test-local table and contains no DROP",()=>{
  assert.match(W10_ORDERS_SQL,/^CREATE TABLE w10_http_fixture_orders\s*\(/);
  assert.match(W10_ORDERS_SQL,/\bENGINE=InnoDB\b/);
  assert.doesNotMatch(W10_ORDERS_SQL,/\bDROP\b|\bTRUNCATE\b|\bDELETE\b/);
  assert.equal(W10_ORDERS_SQL.match(/CREATE TABLE/g)?.length,1);
});
