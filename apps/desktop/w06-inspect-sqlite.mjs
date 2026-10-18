// Read-only diagnostic of the *synthetic W05* SQLite database.
// The native launcher supplies the fixed path, not the renderer or a user.
import {DatabaseSync} from "node:sqlite";
import {resolve} from "node:path";
import {statSync} from "node:fs";

if(process.argv.length!==3)process.exit(2);
const file=resolve(process.argv[2]);
if(!statSync(file).isFile())process.exit(3);
const db=new DatabaseSync(file,{readOnly:true,timeout:1500});
try{
  db.exec("PRAGMA query_only=ON");
  const check=db.prepare("PRAGMA integrity_check").all();
  if(check.length!==1||check[0].integrity_check!=="ok")process.exit(4);
  if(db.prepare("PRAGMA foreign_key_check").all().length!==0)process.exit(7);
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x=>x.name));
  if(!["orders","events","outbox"].every(x=>tables.has(x)))process.exit(5);
  const orders=db.prepare("SELECT count(*) AS n FROM orders").get().n;
  const events=db.prepare("SELECT count(*) AS n FROM events").get().n;
  const pending=db.prepare("SELECT count(*) AS n FROM outbox WHERE synced_at IS NULL").get().n;
  if(![orders,events,pending].every(x=>Number.isSafeInteger(x)&&x>=0))process.exit(6);
  process.stdout.write(JSON.stringify({healthy:true,orders,events,pending})+"\n");
}finally{db.close();}
