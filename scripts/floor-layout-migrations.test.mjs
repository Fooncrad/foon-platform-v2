import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {splitSqlStatements} from "./sql-statements.mjs";

const sql = async (name) => readFile(new URL("../migrations/"+name, import.meta.url), "utf8");

test("floor layout DDL can be safely retried after a partial MySQL/MariaDB DDL failure", async () => {
  const [layouts, operations, links, alerts] = await Promise.all([
    sql("0306_restaurant_floor_plan_layouts.sql"),
    sql("0307_floor_layout_operations.sql"),
    sql("0308_floor_table_real_links.sql"),
    sql("0309_restaurant_section_staff_alerts.sql")
  ]);
  assert.match(layouts, /CREATE TABLE IF NOT EXISTS restaurant_floor_plan_layouts/);
  assert.match(operations, /information_schema\\.columns/);
  assert.match(operations, /PREPARE foon_floor_add_is_active_stmt/);
  assert.match(operations, /EXECUTE foon_floor_add_is_active_stmt/);
  assert.match(operations, /DEALLOCATE PREPARE foon_floor_add_is_active_stmt/);
  assert.match(operations, /CREATE TABLE IF NOT EXISTS restaurant_floor_table_operations/);
  assert.match(links, /CREATE TABLE IF NOT EXISTS restaurant_floor_table_links/);
  assert.match(links, /UNIQUE KEY uq_floor_real_table/);
  assert.match(alerts, /CREATE TABLE IF NOT EXISTS restaurant_section_staff_assignments/);
  assert.match(alerts, /CREATE TABLE IF NOT EXISTS restaurant_section_host_alerts/);
  for (const source of [layouts, operations, links, alerts]) {
    assert.ok(splitSqlStatements(source).length > 0);
  }
});

test("floor migrations retain tenant and branch composite isolation keys", async () => {
  const [layouts, operations, links, alerts] = await Promise.all([
    sql("0306_restaurant_floor_plan_layouts.sql"),
    sql("0307_floor_layout_operations.sql"),
    sql("0308_floor_table_real_links.sql"),
    sql("0309_restaurant_section_staff_alerts.sql")
  ]);
  assert.match(layouts, /INDEX floor_layout_branch_section \(tenant_id,branch_id,section_id\)/);
  assert.match(operations, /PRIMARY KEY \(tenant_id,branch_id,layout_id,floor_table_id\)/);
  assert.match(links, /PRIMARY KEY \(tenant_id,branch_id,layout_id,floor_table_id\)/);
  assert.match(alerts, /PRIMARY KEY \(tenant_id,branch_id,section_id,user_id,duty\)/);
});
