import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";

test("fresh migrations, repeat runs, manual 0014 import, tenant FK and wrong definitions", async () => {
  const url = new URL(process.env.DATABASE_URL || "");
  // This destructive integration test is confined to a dedicated local CI database.
  assert.equal(url.protocol, "mysql:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/foon_migration_test");
  const db = await mysql.createConnection(url.href);
  const migrate = () => spawnSync(process.execPath, ["scripts/migrate.mjs"], {
    encoding:"utf8", timeout:60000, env:process.env
  });
  const successfulRun = () => {
    const result=migrate();
    assert.ifError(result.error);
    assert.equal(result.status,0,result.stderr || result.stdout);
  };
  try {
    const [[schema]]=await db.query("SELECT DATABASE() AS name");
    assert.equal(schema.name,"foon_migration_test");
    successfulRun();
    const [[tables]]=await db.query("SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()");
    assert.equal(Number(tables.n),25);
    const [[history]]=await db.query("SELECT COUNT(*) AS n FROM schema_migrations");
    assert.equal(Number(history.n),17);
    await db.execute("UPDATE ui_translations SET text_en=? WHERE translation_key=?",
      ["Human edit must survive", "common.account"]);
    successfulRun();
    const [[translation]]=await db.execute("SELECT text_en FROM ui_translations WHERE translation_key=?",["common.account"]);
    assert.equal(translation.text_en,"Human edit must survive");

    // Equivalent to 0014 already imported manually but absent from the ledger.
    await db.execute("DELETE FROM schema_migrations WHERE id=?",["0014_payment_tenant_integrity.sql"]);
    successfulRun();
    const [[replayed]]=await db.execute("SELECT COUNT(*) AS n FROM schema_migrations WHERE id=?",["0014_payment_tenant_integrity.sql"]);
    assert.equal(Number(replayed.n),1);

    await db.execute("INSERT INTO tenants(id,slug,name) VALUES (?,?,?),(?,?,?)",
      ["tenant-a","test-a","A","tenant-b","test-b","B"]);
    await db.execute("INSERT INTO branches(id,tenant_id,name,slug) VALUES (?,?,?,?)",
      ["branch-b","tenant-b","B","main"]);
    await assert.rejects(db.execute(
      "INSERT INTO tenant_payment_settings(id,tenant_id,branch_id,scope_key) VALUES (?,?,?,?)",
      ["bad-settings","tenant-a","branch-b","branch-b"]),
      error=>error.code==="ER_NO_REFERENCED_ROW_2");

    // A same-named but wrong index must fail, not silently mark the migration done.
    await db.query("ALTER TABLE tenant_payment_settings DROP FOREIGN KEY fk_payment_branch_same_tenant");
    await db.query("ALTER TABLE branches DROP INDEX uq_branches_tenant_id");
    await db.query("ALTER TABLE branches ADD INDEX uq_branches_tenant_id (tenant_id)");
    await db.execute("DELETE FROM schema_migrations WHERE id=?",["0014_payment_tenant_integrity.sql"]);
    const failed=migrate();
    assert.ifError(failed.error);
    assert.notEqual(failed.status,0);
    const [[unrecorded]]=await db.execute("SELECT COUNT(*) AS n FROM schema_migrations WHERE id=?",["0014_payment_tenant_integrity.sql"]);
    assert.equal(Number(unrecorded.n),0);
  } finally {
    await db.end();
  }
});
