import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import mysql from "mysql2/promise";
import {provisionStore} from "./provision-store.mjs";
import {registerCustomer} from "./register-customer.mjs";

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
    assert.equal(Number(tables.n),40);
    const [[history]]=await db.query("SELECT COUNT(*) AS n FROM schema_migrations");
    assert.equal(Number(history.n),24);
    await db.execute("UPDATE ui_translations SET text_en=? WHERE translation_key=?",
      ["Human edit must survive", "common.account"]);
    successfulRun();
    const [[translation]]=await db.execute("SELECT text_en FROM ui_translations WHERE translation_key=?",["common.account"]);
    assert.equal(translation.text_en,"Human edit must survive");

    // New owner starts working with an active free subscription immediately.
    await db.beginTransaction();
    await db.execute("INSERT INTO users(id,email,status) VALUES ('owner-test','owner@test.example','active')");
    const workspace=await provisionStore(db,{ownerId:"owner-test",name:"Test store",slug:"signup-store"});
    await db.commit();
    const [[subscription]]=await db.execute("SELECT t.status,p.code,s.status AS subscription_status FROM tenants t JOIN tenant_subscriptions s ON s.tenant_id=t.id JOIN package_plans p ON p.id=s.plan_id WHERE t.id=?",[workspace.tenant.id]);
    assert.equal(subscription.status,"active");assert.equal(subscription.code,"free");assert.equal(subscription.subscription_status,"active");

    await db.beginTransaction();
    const customer=await registerCustomer(db,{id:"customer-test",email:"customer@test.example",passwordHash:"test-only",name:"Customer",storeSlug:"signup-store"});
    await db.commit();
    assert.equal(customer.tenantId,workspace.tenant.id);
    const [[customerAccess]]=await db.query("SELECT (SELECT COUNT(*) FROM tenant_customers WHERE user_id='customer-test') AS customers,(SELECT COUNT(*) FROM memberships WHERE user_id='customer-test') AS memberships");
    assert.equal(Number(customerAccess.customers),1);assert.equal(Number(customerAccess.memberships),0);
    await db.beginTransaction();
    await assert.rejects(registerCustomer(db,{id:"duplicate-customer",email:"customer@test.example",passwordHash:"test-only",name:"",storeSlug:"signup-store"}),error=>error.code==="ER_DUP_ENTRY");
    await db.rollback();
    const [[noDuplicate]]=await db.query("SELECT COUNT(*) AS n FROM tenant_customers WHERE user_id='duplicate-customer'");assert.equal(Number(noDuplicate.n),0);
    await assert.rejects(registerCustomer(db,{id:"missing-store-customer",email:"missing@test.example",passwordHash:"test-only",name:"",storeSlug:"missing-store"}),/STORE_NOT_FOUND/);
    await db.beginTransaction();
    await assert.rejects(provisionStore(db,{ownerId:"nonexistent-owner",name:"Rollback",slug:"rollback-store"}),error=>error.code==="ER_NO_REFERENCED_ROW_2");
    await db.rollback();
    const [[rolledBack]]=await db.query("SELECT COUNT(*) AS n FROM tenants WHERE slug='rollback-store'");
    assert.equal(Number(rolledBack.n),0);
    await db.query("UPDATE package_plans SET enabled=FALSE WHERE code='free'");
    await db.beginTransaction();
    await db.query("INSERT INTO users(id,email,status) VALUES ('rollback-owner','rollback@test.example','active')");
    await assert.rejects(provisionStore(db,{ownerId:"rollback-owner",name:"Rollback owner",slug:"rollback-owner"}),/FREE_PLAN_UNAVAILABLE/);
    await db.rollback();
    const [[noOwner]]=await db.query("SELECT COUNT(*) AS n FROM users WHERE id='rollback-owner'");assert.equal(Number(noOwner.n),0);
    await db.query("UPDATE package_plans SET enabled=TRUE WHERE code='free'");

    // Replay the new data migration: release review only; preserve paid/disabled states.
    await db.execute("INSERT INTO tenants(id,slug,name,status) VALUES ('legacy-free','legacy-free','Legacy','pending'),('legacy-paid','legacy-paid','Paid','active'),('legacy-suspended','legacy-suspended','Suspended','suspended')");
    await db.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES ('legacy-owner','legacy-free','owner-test','owner','active')");
    await db.execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES ('paid-plan','test-paid','Paid','Paid','Paid')");
    await db.execute("INSERT INTO tenant_subscriptions(id,tenant_id,plan_id,status) VALUES ('paid-sub','legacy-paid','paid-plan','pending')");
    await db.execute("DELETE FROM schema_migrations WHERE id='0018_automatic_free_stores.sql'");
    successfulRun();successfulRun();
    const [[legacy]]=await db.query("SELECT status FROM tenants WHERE id='legacy-free'");assert.equal(legacy.status,"active");
    const [[paid]]=await db.query("SELECT plan_id,status FROM tenant_subscriptions WHERE tenant_id='legacy-paid'");assert.equal(paid.plan_id,"paid-plan");assert.equal(paid.status,"pending");
    const [[suspended]]=await db.query("SELECT status FROM tenants WHERE id='legacy-suspended'");assert.equal(suspended.status,"suspended");

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
