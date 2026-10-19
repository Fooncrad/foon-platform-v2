// Apply the listing columns portably on MySQL and MariaDB, including safe
// recovery when DDL partially completed before its migration marker was saved.
export async function ensureMarketplaceVisibility(connection){
 const columns=[
  ["market_enabled","BOOLEAN NOT NULL DEFAULT FALSE"],
  ["market_visible_from","DATETIME NULL"],
  ["market_visible_until","DATETIME NULL"],
  ["market_sort_order","INT NOT NULL DEFAULT 0"]
 ];
 const [rows]=await connection.execute("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='tenants'");
 const existing=new Set(rows.map(row=>String(row.COLUMN_NAME)));
 const missing=columns.filter(([name])=>!existing.has(name)).map(([name,definition])=>"ADD COLUMN "+name+" "+definition);
 if(missing.length)await connection.query("ALTER TABLE tenants "+missing.join(", "));
}
