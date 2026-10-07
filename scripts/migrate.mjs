import mysql from "mysql2/promise";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const url=process.env.DATABASE_URL;
if(!url) throw new Error("DATABASE_URL_MISSING");
const db=await mysql.createConnection(url);
try {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  const files=(await readdir("migrations")).filter(x=>x.endsWith(".sql")).sort();
  for(const file of files){
    const [done]=await db.execute("SELECT id FROM schema_migrations WHERE id=? LIMIT 1",[file]);
    if(done.length){console.log("Already applied",file);continue;}
    const source=await readFile(join("migrations",file),"utf8");
    const statements=source
      .split(";")
      .map(statement=>statement.trim())
      .filter(Boolean);
    await db.beginTransaction();
    try {
      for(const statement of statements) await db.query(statement);
      await db.execute("INSERT INTO schema_migrations(id) VALUES (?)",[file]);
      await db.commit();
      console.log("Applied",file);
    } catch(error) {
      await db.rollback();
      throw error;
    }
  }
} finally {
  await db.end();
}
