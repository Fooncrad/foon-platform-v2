import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { splitSqlStatements } from "./sql-statements.mjs";

test("semicolons inside every SQL quote and doubled quotes remain intact", () => {
  const sql = "SELECT 'a;b', 'it''s;x', \"a;b\", \x60a;b\x60; SELECT 2;";
  assert.deepEqual(splitSqlStatements(sql), [sql.slice(0, -11), "SELECT 2"]);
});
test("backslash escaped quotes are respected", () => {
  assert.deepEqual(splitSqlStatements(String.raw`SELECT 'a\';b'; SELECT 2;`),
    [String.raw`SELECT 'a\';b'`, "SELECT 2"]);
});
test("NO_BACKSLASH_ESCAPES and ANSI_QUOTES are handled", () => {
  assert.deepEqual(splitSqlStatements(String.raw`SELECT 'a\'; SELECT 2;`,
    {noBackslashEscapes:true}), [String.raw`SELECT 'a\'`, "SELECT 2"]);
  assert.deepEqual(splitSqlStatements('SELECT "a\\\\"; SELECT 2;', {ansiQuotes:true}),
    ['SELECT "a\\\\"', "SELECT 2"]);
});
test("comments cannot create statements or join SQL tokens", () => {
  assert.deepEqual(splitSqlStatements("-- comment; ignored\nSELECT/* ; */1; # ignored;\nSELECT 2;"),
    ["SELECT 1", "SELECT 2"]);
  assert.deepEqual(splitSqlStatements("SELECT 3--2;"), ["SELECT 3--2"]);
  assert.deepEqual(splitSqlStatements("/* only; */ -- only;"), []);
});
test("quotes protect SQL comment markers", () => {
  assert.deepEqual(splitSqlStatements("SELECT '--;#/*';"), ["SELECT '--;#/*'"]);
});
test("unterminated syntax and unsupported executable constructs fail closed", () => {
  for (const sql of ["SELECT 'x", 'SELECT "x', "SELECT \x60x", "/* unclosed",
    "/*! SELECT 1 */;", "/*M! SELECT 1 */;", "/*+ hint */ SELECT 1;",
    "DELIMITER $$\nSELECT 1$$"]) {
    assert.throws(() => splitSqlStatements(sql));
  }
});
test("all repository migrations parse with expected statement counts", async () => {
  const counts = [3,4,3,1,4,1,1,1,1,1,1,1,1,8,1,1,2,5,1,2,2,1,5,5,1,1,1,1,3,6,1,6,1,1,2,2];
  const files = (await readdir("migrations")).filter(file => file.endsWith(".sql")).sort();
  assert.equal(files.length, counts.length);
  for (const [i,file] of files.entries()) {
    const sql = await readFile("migrations/"+file,"utf8");
    const statements = splitSqlStatements(sql);
    assert.equal(statements.length, counts[i], file);
    assert.ok(statements.every(statement => statement.trim()), file);
  }
});
test("real translation data and payment/outbox CREATEs remain whole", async () => {
  const [seed] = splitSqlStatements(await readFile("migrations/0008_seed_reference_translations.sql","utf8"));
  assert.ok(seed.includes("Self-ordering is disabled for this restaurant; ask a waiter"));
  assert.ok(seed.endsWith("translation_key=VALUES(translation_key)"));
  for (const name of ["0013_tenant_payment_settings.sql","0016_notification_outbox.sql"]) {
    const statements = splitSqlStatements(await readFile("migrations/"+name,"utf8"));
    assert.equal(statements.length, 1);
    assert.match(statements[0], /^CREATE TABLE IF NOT EXISTS/);
  }
});
