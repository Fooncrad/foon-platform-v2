// Portable MySQL/MariaDB replay of migration 0065. Never overwrite a column.
export async function ensureDiningContext(connection){
 const columns=[
  ["dining_section_id","char(36)","CHAR(36) NULL"],
  ["party_size","int unsigned","INT UNSIGNED NULL"],
  ["dining_snapshot","json","JSON NULL"]
 ];
 const [rows]=await connection.execute("SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='restaurant_orders'");
 const existing=new Map(rows.map(row=>[row.COLUMN_NAME,row]));
 const missing=[];
 for(const [name,type,definition] of columns){
  const prior=existing.get(name);
  // MariaDB represents JSON as checked LONGTEXT; existing migration uses JSON.
  const priorType=prior?String(prior.COLUMN_TYPE).toLowerCase().replace(/int\(\d+\)/,"int"):"";
  const matches=prior&&(priorType===type||name==="dining_snapshot"&&priorType==="longtext");
  if(prior&&(!matches||prior.IS_NULLABLE!=="YES"))throw Error("DINING_MIGRATION_COLUMN_MISMATCH:"+name);
  if(!prior)missing.push("ADD COLUMN "+name+" "+definition);
 }
 if(missing.length)await connection.query("ALTER TABLE restaurant_orders "+missing.join(", "));
}
