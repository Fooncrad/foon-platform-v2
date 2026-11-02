// Read-only diagnostic for legacy menu-item/resource FK compatibility.
// Usage: DATABASE_URL=... node scripts/check-edge-catalog.mjs
import mysql from "mysql2/promise";
const url=process.env.DATABASE_URL;
if(!url)throw Error("DATABASE_URL_MISSING");
const db=await mysql.createConnection(url);
try{
 const [rows]=await db.execute(`
 SELECT
  COUNT(*) AS catalog_items,
  COALESCE(SUM(CASE WHEN rr.id IS NULL THEN 1 ELSE 0 END),0) AS missing_resources,
  COALESCE(SUM(CASE WHEN rr.id IS NOT NULL AND (rr.tenant_id<>mi.tenant_id OR rr.kind<>'menu_item') THEN 1 ELSE 0 END),0) AS conflicting_resources,
  COALESCE(SUM(CASE WHEN rr.id IS NOT NULL AND rr.tenant_id=mi.tenant_id AND rr.kind='menu_item' AND rr.archived=1 THEN 1 ELSE 0 END),0) AS archived_resources
 FROM restaurant_menu_items mi
 LEFT JOIN restaurant_resources rr ON rr.id=mi.id`);
 const summary=rows[0];
 console.log(JSON.stringify({catalogItems:Number(summary.catalog_items),missingResources:Number(summary.missing_resources),conflictingResources:Number(summary.conflicting_resources),archivedResources:Number(summary.archived_resources)}));
 if(Number(summary.missing_resources)||Number(summary.conflicting_resources)||Number(summary.archived_resources))process.exitCode=2;
}finally{await db.end();}
