// Pure W08 stage-2 safety tests: NO MariaDB connection or writes.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stage2LocalUrl,checkStage2Identity,stage2InboxCreateSql,STAGE2_ORDERS_SCHEMA} from "./w08-mariadb-stage2-safety.mjs";
const url="mysql://foon_edge_runner:local-only-test@127.0.0.1:3306/foon_edge_test";
const grant=value=>({Grants:value});
const quote=s=>String.fromCharCode(96)+s+String.fromCharCode(96);
const account=quote("foon_edge_runner")+"@"+quote("localhost");
const goodGrants=[
  grant("GRANT USAGE ON *.* TO "+account),
  grant("GRANT ALL PRIVILEGES ON "+quote("foon_edge_test")+".* TO "+account),
  grant("GRANT SELECT, INSERT, CREATE ON "+quote("test")+".* TO PUBLIC"),
  grant("GRANT SELECT, INSERT, CREATE ON "+quote("test\\_%")+".* TO PUBLIC")
];
const identity={dbname:"foon_edge_test",server_port:3306,account:"foon_edge_runner@localhost"};

test("W08 stage 2 URL is restricted to loopback, single database and single dedicated user",()=>{
  assert.equal(stage2LocalUrl(url),url);
  for(const target of [
    "", "mysql://root:test@127.0.0.1:3306/foon_edge_test",
    "mysql://other:test@127.0.0.1:3306/foon_edge_test",
    "mysql://foon_edge_runner:test@localhost:3306/foon_edge_test",
    "mysql://foon_edge_runner:test@127.0.0.2:3306/foon_edge_test",
    "mysql://foon_edge_runner:test@127.0.0.1:3307/foon_edge_test",
    "mysql://foon_edge_runner:test@127.0.0.1:3306/foon_v2_test",
    "mysql://foon_edge_runner:test@127.0.0.1:3306/foon_edge_test?multipleStatements=true",
    "mysql://foon_edge_runner:test@127.0.0.1:3306/foon_edge_test#x",
    "https://foon_edge_runner:test@127.0.0.1:3306/foon_edge_test"
  ])assert.throws(()=>stage2LocalUrl(target),/W08_STAGE2_/);
});

test("W08 stage 2 requires an initially empty schema and a specific account",()=>{
  assert.deepEqual(checkStage2Identity(identity,goodGrants,[]),{publicFixtureGrants:2});
  assert.throws(()=>checkStage2Identity(identity,goodGrants,[{TABLE_NAME:"existing"}]),/W08_STAGE2_DATABASE_NOT_EMPTY/);
  assert.throws(()=>checkStage2Identity({...identity,account:"root@localhost"},goodGrants,[]),/W08_STAGE2_UNEXPECTED_IDENTITY/);
  assert.throws(()=>checkStage2Identity({...identity,dbname:"production"},goodGrants,[]),/W08_STAGE2_UNEXPECTED_IDENTITY/);
  assert.throws(()=>checkStage2Identity({...identity,server_port:3307},goodGrants,[]),/W08_STAGE2_UNEXPECTED_IDENTITY/);
  assert.throws(()=>checkStage2Identity(identity,[...goodGrants,grant("GRANT INSERT ON production.* TO PUBLIC")],[]),/W08_UNEXPECTED_PUBLIC_GRANT/);
  assert.throws(()=>checkStage2Identity(identity,[...goodGrants,grant("GRANT ALL PRIVILEGES ON production.* TO "+account)],[]),/W08_ACCOUNT_HAS_OTHER_DATABASE_PRIVILEGES/);
});

test("W08 stage 2 executes only the existing, single inbox CREATE TABLE statement",async()=>{
  const migration=await readFile("migrations/0073_edge_sync_inbox.sql","utf8");
  const ddl=stage2InboxCreateSql(migration);
  assert.match(ddl,/^CREATE TABLE IF NOT EXISTS edge_sync_inbox\s*\(/);
  assert.match(STAGE2_ORDERS_SCHEMA,/^CREATE TABLE w08_fixture_orders\s*\(/);
  assert.doesNotMatch(STAGE2_ORDERS_SCHEMA,/\bDROP\b/i);
  for(const unsafe of [
    "CREATE TABLE edge_sync_inbox (id INT);",
    migration+"\nDROP DATABASE foon_edge_test;",
    "CREATE TABLE IF NOT EXISTS unrelated (id INT);",
    "CREATE TABLE IF NOT EXISTS edge_sync_inbox (id INT) ENGINE=InnoDB;"
  ])assert.throws(()=>stage2InboxCreateSql(unsafe),/W08_STAGE2_/);
});
