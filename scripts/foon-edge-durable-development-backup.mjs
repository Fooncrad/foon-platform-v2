// W28 development ONLY: online SQLite backup with WAL-consistent snapshot.
// Never touches the production cloud, live W05 databases or merchant inventory.
import {DatabaseSync,backup} from "node:sqlite";
import {randomBytes} from "node:crypto";
import {readFile,mkdir,lstat,rename,rm,writeFile} from "node:fs/promises";
import {join,resolve} from "node:path";
import {homedir} from "node:os";
if(process.argv.length!==3||process.argv[2]!=="--development-only")
 throw Error("W28_EXPLICIT_DEVELOPMENT_BACKUP_REQUIRED");
if(process.platform!=="win32")throw Error("W28_WINDOWS_REQUIRED");
const appdata=process.env.LOCALAPPDATA;
if(!appdata||!resolve(appdata).toLowerCase().startsWith(resolve(homedir()).toLowerCase()))
 throw Error("W28_LOCAL_APPDATA_REQUIRED");
const root=join(appdata,"FOON","W28-DEVELOPMENT-ONLY");
const marker=JSON.parse(await readFile(join(root,"W28-SYNTHETIC-ONLY.json"),"utf8"));
if(marker.profile!=="W28-DEVELOPMENT-ONLY")throw Error("W28_PROFILE_NOT_SYNTHETIC");
const source=join(root,"orders.sqlite"),folder=join(root,"backups");
const fileInfo=await lstat(source);
if(!fileInfo.isFile()||fileInfo.isSymbolicLink())throw Error("W28_DB_UNSAFE");
await mkdir(folder,{recursive:true,mode:0o700});
if((await lstat(folder)).isSymbolicLink())throw Error("W28_BACKUP_PATH_UNSAFE");
const nonce=randomBytes(6).toString("hex");
const stamp=new Date().toISOString().replace(/[^0-9A-Za-z]/g,"-");
const destination=join(folder,stamp+"-"+nonce+".sqlite");
const temporary=destination+".part";
let db,verified;
try{
 db=new DatabaseSync(source,{readOnly:true});
 const integrity=db.prepare("PRAGMA quick_check").get();
 if(Object.values(integrity)[0]!=="ok")throw Error("W28_SOURCE_DB_INTEGRITY_FAILED");
 const orders=db.prepare("SELECT COUNT(*) AS n FROM orders").get().n;
 const pending=db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE synced_at IS NULL").get().n;
 await backup(db,temporary);
 db.close();db=undefined;
 verified=new DatabaseSync(temporary,{readOnly:true});
 if(Object.values(verified.prepare("PRAGMA quick_check").get())[0]!=="ok")
   throw Error("W28_BACKUP_INTEGRITY_FAILED");
 if(verified.prepare("SELECT COUNT(*) AS n FROM orders").get().n!==orders||
    verified.prepare("SELECT COUNT(*) AS n FROM outbox WHERE synced_at IS NULL").get().n!==pending)
   throw Error("W28_BACKUP_ROW_COUNTS_MISMATCH");
 verified.close();verified=undefined;
 await rename(temporary,destination);
 await writeFile(destination+".json",JSON.stringify({
   profile:"W28-DEVELOPMENT-ONLY",createdAt:new Date().toISOString(),
   orders,pending,sqliteFile:destination.split(/[\\/]/).pop()
 },null,2),{flag:"wx",mode:0o600});
 process.stdout.write("W28 CONSISTENT SQLITE BACKUP SAVED: "+destination+"\n");
 process.stdout.write("Orders: "+orders+"; Unsynced Outbox rows: "+pending+"\n");
 process.stdout.write("Original SQLite database was NOT modified; backup is DEVELOPMENT ONLY.\n");
}catch(e){await rm(temporary,{force:true}).catch(()=>{});throw e;}
finally{db?.close();verified?.close();}
