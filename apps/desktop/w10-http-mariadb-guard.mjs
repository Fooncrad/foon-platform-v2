// W10 is a ONE-TIME synthetic HTTP + MariaDB test only.
// W08's 4 inbox rows and 4 order fixtures must already exist and remain
// untouched. No full migrations or DROP are permitted.
import {checkMariaDbTestGrants} from "./w08-mariadb-grants.mjs";

export const W10_ORDERS_TABLE="w10_http_fixture_orders";
export const W10_ORDERS_SQL=[
  "CREATE TABLE w10_http_fixture_orders (",
  "order_id VARCHAR(128) NOT NULL PRIMARY KEY,",
  "tenant_id VARCHAR(64) NOT NULL,",
  "branch_id VARCHAR(64) NOT NULL,",
  "device_id VARCHAR(128) NOT NULL,",
  "status VARCHAR(32) NOT NULL,",
  "item_count INT UNSIGNED NOT NULL,",
  "version BIGINT UNSIGNED NOT NULL DEFAULT 1,",
  "CONSTRAINT w10_item_count_positive CHECK (item_count > 0)",
  ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
].join("\n");

export function w10LocalUrl(raw){
  if(typeof raw!=="string"||!raw)throw Error("W10_URL_REQUIRED");
  let u;try{u=new URL(raw);}catch{throw Error("W10_INVALID_URL");}
  if(u.protocol!=="mysql:"||u.hostname!=="127.0.0.1"||
    (u.port&&u.port!=="3306")||u.pathname!=="/foon_edge_test"||
    u.username!=="foon_edge_runner"||!u.password||u.hash||u.search)
    throw Error("W10_FORBIDDEN_MYSQL_TARGET");
  return u.href;
}

export function checkW10InitialState(identity,grants,tables,counts){
  if(identity?.dbname!=="foon_edge_test"||
     Number(identity?.port)!==3306||
     !/^foon_edge_runner@(localhost|127\.0\.0\.1)$/.test(String(identity?.account??"")))
    throw Error("W10_UNEXPECTED_MYSQL_IDENTITY");
  const grantsReview=checkMariaDbTestGrants(grants);
  const names=Array.isArray(tables)?tables.map(row=>row.TABLE_NAME??row.table_name):[];
  if(names.length!==2||!["edge_sync_inbox","w08_fixture_orders"].every(s=>names.includes(s)))
    throw Error("W10_UNEXPECTED_SCHEMA_REFUSE_WRITE");
  if(Number(counts?.inbox)!==4||Number(counts?.orders)!==4)
    throw Error("W10_W08_BASELINE_COUNTS_CHANGED");
  return grantsReview;
}
