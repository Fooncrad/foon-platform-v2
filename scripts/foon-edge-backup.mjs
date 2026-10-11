import {DatabaseSync} from "node:sqlite";
import {copyFile,mkdir,rename,stat} from "node:fs/promises";
import {dirname,resolve} from "node:path";

const source=resolve(process.env.FOON_LAN_DB||"./data/foon-lan.sqlite");
const target=resolve(process.argv[2]||"./backups/foon-lan-backup.sqlite");
if(source===target)throw new Error("Backup destination must differ from source");
const db=new DatabaseSync(source,{readOnly:true});
try{
 const check=db.prepare("PRAGMA quick_check").get();
 if(Object.values(check)[0]!=="ok")throw new Error("Source database failed integrity check");
 await mkdir(dirname(target),{recursive:true});
 const temporary=target+"."+process.pid+".tmp";
 await db.backup(temporary);
 const verification=new DatabaseSync(temporary,{readOnly:true});
 try{
  const result=verification.prepare("PRAGMA integrity_check").get();
  if(Object.values(result)[0]!=="ok")throw new Error("Backup integrity check failed");
 }finally{verification.close();}
 await rename(temporary,target);
 const metadata=await stat(target);
 process.stdout.write(JSON.stringify({ok:true,path:target,bytes:metadata.size})+"\n");
}finally{db.close();}
