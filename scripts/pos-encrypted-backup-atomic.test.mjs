import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Execute the exact atomic transaction helper from the shipped browser source,
// not an independent rewrite of the transaction logic.
const source=readFileSync(new URL("../public/foon-offline-pos.js",import.meta.url),"utf8");
const start=source.indexOf("async function commitEncryptedRestore(prepared){");
const end=source.indexOf("\nasync function importEncrypted(event){",start);
assert.ok(start>=0&&end>start,"atomic encrypted restore helper must be present");
const helper=source.slice(start,end);
const load=db=>new Function("db","return ("+helper+")")(db);

function syntheticIdb(initial=[],{failAdd=null,mutate=null}={}){
 const committed=new Map(initial.map(row=>[row.id,structuredClone(row)]));
 const db=async()=>({
  close(){},
  transaction(name,mode){
   assert.equal(name,"orders");assert.equal(mode,"readwrite");
   const staged=new Map([...committed].map(([id,row])=>[id,structuredClone(row)]));
   mutate?.(staged);
   const jobs=[];let aborted=false,done=false,scheduled=false;
   const transaction={
    oncomplete:null,onabort:null,onerror:null,
    objectStore(name){
     assert.equal(name,"orders");
     return {
      get(id){const request={result:undefined,onsuccess:null};jobs.push(()=>{
       request.result=staged.get(id);request.onsuccess?.();
      });schedule();return request;},
      add(row){if(row.id===failAdd)throw Error("SIMULATED_DISK_WRITE_FAILURE");
       if(staged.has(row.id))throw Error("DUPLICATE_ORDER");
       staged.set(row.id,structuredClone(row));
      }
     };
    },
    abort(){if(aborted||done)return;aborted=true;queueMicrotask(()=>transaction.onabort?.());}
   };
   function schedule(){if(scheduled)return;scheduled=true;setImmediate(()=>{
    scheduled=false;if(aborted||done)return;
    const job=jobs.shift();if(job)job();
    if(aborted)return;
    if(jobs.length){schedule();return;}
    done=true;committed.clear();for(const [id,row] of staged)committed.set(id,row);
    transaction.oncomplete?.();
   });}
   // Empty imports must complete, too.
   schedule();
   return transaction;
  }
 });
 return {db,committed};
}
const row=id=>({id,profileId:"account:tenant:branch",orderId:id,iv:[1,2,3],cipher:[4,5,6]});

test("new encrypted orders commit together",async()=>{
 const store=syntheticIdb();
 assert.equal(await load(store.db)([{row:row("one"),prior:null},{row:row("two"),prior:null}]),2);
 assert.deepEqual([...store.committed.keys()],["one","two"]);
});
test("reimport leaves an already-present ciphertext record untouched",async()=>{
 const existing=row("one"),store=syntheticIdb([existing]);
 assert.equal(await load(store.db)([{row:row("one"),prior:existing},{row:row("two"),prior:null}]),1);
 assert.deepEqual([...store.committed.keys()],["one","two"]);
});
test("failure on a later add rolls back all prior inserts",async()=>{
 const store=syntheticIdb([],{failAdd:"three"});
 await assert.rejects(load(store.db)([{row:row("one"),prior:null},{row:row("two"),prior:null},{row:row("three"),prior:null}]),/ENCRYPTED_BACKUP_RESTORE_CONFLICT/);
 assert.equal(store.committed.size,0);
});
test("a changed existing order rejects the entire backup",async()=>{
 const existing=row("old"),changed={...existing,cipher:[9,9,9]};
 const store=syntheticIdb([existing],{mutate:staged=>staged.set("old",changed)});
 await assert.rejects(load(store.db)([{row:row("fresh"),prior:null},{row:row("old"),prior:existing}]),/ENCRYPTED_BACKUP_RESTORE_CONFLICT/);
 assert.deepEqual([...store.committed.keys()],["old"]);
});
test("a simultaneous insert is never overwritten or partially restored",async()=>{
 const store=syntheticIdb([],{mutate:staged=>staged.set("existing",row("existing"))});
 await assert.rejects(load(store.db)([{row:row("fresh"),prior:null},{row:row("existing"),prior:null}]),/ENCRYPTED_BACKUP_RESTORE_CONFLICT/);
 assert.equal(store.committed.size,0);
});
test("empty backup commits without creating records",async()=>{
 const store=syntheticIdb();
 assert.equal(await load(store.db)([]),0);assert.equal(store.committed.size,0);
});
