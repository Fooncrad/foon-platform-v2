import mysql from "mysql2/promise";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { splitSqlStatements } from "./sql-statements.mjs";

const url=process.env.DATABASE_URL;
if(!url) throw new Error("DATABASE_URL_MISSING");
const db=await mysql.createConnection(url);
let lockName;
try {
  const [[settings]]=await db.query("SELECT DATABASE() AS db_name, @@SESSION.sql_mode AS sql_mode");
  if(!settings.db_name) throw new Error("DATABASE_NAME_MISSING");
  lockName="foon:migrate:"+createHash("sha256").update(settings.db_name).digest("hex").slice(0,40);
  const [[lock]]=await db.execute("SELECT GET_LOCK(?,0) AS acquired",[lockName]);
  if(Number(lock.acquired)!==1) throw new Error("MIGRATION_ALREADY_RUNNING");
  const modes=String(settings.sql_mode).split(",");
  const parseOptions={noBackslashEscapes:modes.includes("NO_BACKSLASH_ESCAPES"),ansiQuotes:modes.includes("ANSI_QUOTES")};
  // Parse every file before any migration writes, including the recurring seed.
  const sources=new Map();
  for(const file of (await readdir("migrations")).filter(x=>x.endsWith(".sql")).sort()){
    sources.set(file,splitSqlStatements(await readFile(join("migrations",file),"utf8"),parseOptions));
  }
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(120) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
  const files=[...sources.keys()];
  for(const file of files){
    const [done]=await db.execute("SELECT id FROM schema_migrations WHERE id=? LIMIT 1",[file]);
    if(done.length){console.log("Already applied",file);continue;}
    const statements=sources.get(file);
    // DDL implicitly commits in MySQL/MariaDB; rollback cannot undo it.
    // Record a migration only after all statements complete successfully.
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
  // Reconcile reference language keys on every migration/deployment run.
  // Existing human-edited translations are never overwritten.
  const seedSql=sources.get("0008_seed_reference_translations.sql");
  for(const statement of seedSql)await db.query(statement);
  console.log("Translation dictionary synchronized (existing edits preserved)");
} finally {
  try { if(lockName) await db.execute("SELECT RELEASE_LOCK(?)",[lockName]); }
  finally { await db.end(); }
}
