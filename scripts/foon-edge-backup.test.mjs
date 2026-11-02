import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {spawn} from "node:child_process";
import {mkdtempSync,rmSync,existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";

test("Edge backup preserves committed data and passes integrity check",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"foon-edge-backup-"));
 try{
  const source=join(dir,"source.sqlite"),target=join(dir,"backup.sqlite");
  const db=new DatabaseSync(source);
  db.exec("PRAGMA journal_mode=WAL; CREATE TABLE orders(id TEXT PRIMARY KEY,status TEXT); INSERT INTO orders VALUES('order-1','new');");
  const result=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,["scripts/foon-edge-backup.mjs",target],{env:{...process.env,FOON_LAN_DB:source}});let stderr="";child.stderr.on("data",chunk=>stderr+=chunk);child.on("error",reject);child.on("close",code=>resolve({code,stderr}));});
  assert.equal(result.code,0,result.stderr);
  assert.equal(existsSync(target),true);
  const restored=new DatabaseSync(target,{readOnly:true});
  try{
   assert.equal(restored.prepare("SELECT status FROM orders WHERE id=?").get("order-1").status,"new");
   assert.equal(Object.values(restored.prepare("PRAGMA integrity_check").get())[0],"ok");
  }finally{restored.close();db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
