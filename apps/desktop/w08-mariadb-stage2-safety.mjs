// FOON W08 stage 2: fail-closed guard for a SINGLE local, initially empty
// and explicitly disposable MariaDB database. Never authorize Hostinger,
// unrelated developer databases, global privileges, or a root account.
import {checkMariaDbTestGrants} from "./w08-mariadb-grants.mjs";
import {splitSqlStatements} from "../../scripts/sql-statements.mjs";

export function stage2LocalUrl(raw){
  if(!raw)throw Error("W08_STAGE2_URL_REQUIRED");
  let url;
  try{url=new URL(raw);}catch{throw Error("W08_STAGE2_BAD_URL");}
  if(url.protocol!=="mysql:"||url.hostname!=="127.0.0.1"||
     (url.port&&url.port!=="3306")||url.pathname!=="/foon_edge_test"||
     url.username!=="foon_edge_runner"||!url.password||url.search||url.hash)
    throw Error("W08_STAGE2_TARGET_FORBIDDEN");
  return url.href;
}

export function checkStage2Identity(identity,grants,tables){
  if(identity?.dbname!=="foon_edge_test"||
      Number(identity?.server_port)!==3306||
      !/^foon_edge_runner@(localhost|127\.0\.0\.1)$/.test(String(identity?.account??"")))
    throw Error("W08_STAGE2_UNEXPECTED_IDENTITY");
  const result=checkMariaDbTestGrants(grants);
  if(!Array.isArray(tables)||tables.length!==0)
    throw Error("W08_STAGE2_DATABASE_NOT_EMPTY");
  return result;
}

export function stage2InboxCreateSql(raw){
  const statements=splitSqlStatements(raw);
  if(statements.length!==1)throw Error("W08_STAGE2_MIGRATION_NOT_ISOLATED");
  const statement=statements[0].trim();
  if(!/^CREATE TABLE IF NOT EXISTS edge_sync_inbox\s*\(/i.test(statement)||
      !/\bUNIQUE KEY edge_sync_inbox_event\s*\(device_id,\s*event_seq\)/i.test(statement)||
      !/\bUNIQUE KEY edge_sync_inbox_receipt\s*\(receipt_id\)/i.test(statement)||
      !/\bENGINE=InnoDB\b/i.test(statement))
    throw Error("W08_STAGE2_UNEXPECTED_INBOX_SCHEMA");
  return statement;
}

export const STAGE2_ORDERS_SCHEMA=String.raw`CREATE TABLE w08_fixture_orders (
  order_id VARCHAR(128) NOT NULL PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  branch_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  event_seq BIGINT UNSIGNED NOT NULL,
  item_count INT UNSIGNED NOT NULL,
  UNIQUE KEY w08_fixture_device_event (device_id, event_seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
