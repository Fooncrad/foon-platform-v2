// Opt-in integration against a disposable MariaDB server.
// Does not require migrations or mutate any application table.
// Run: FOON_SYNC_MARIADB_TEST_URL=... npm run test:bidirectional-sync:mariadb
import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {pushWithMariaDbDeviceLock} from "../lib/platform/bidirectional-sync-mariadb-lock.mjs";

const url=process.env.FOON_SYNC_MARIADB_TEST_URL;
const scope={
 deviceId:"a30a493e-9809-4950-82bc-66d54b6c4ed1",
 tenantId:"aba382f0-5ee0-418a-b25d-f69dc478c421",
 branchId:"cf3d29fb-d91f-4915-91da-eebaf38330c1"
};
test("real MariaDB advisory lock serializes Windows push across separate connections",{
 skip:!url?"FOON_SYNC_MARIADB_TEST_URL is not configured":false,
 timeout:15000
},async()=>{
 const pool=mysql.createPool({uri:url,connectionLimit:3,waitForConnections:true});
 let enterResolve,exitResolve;
 const entered=new Promise(resolve=>{enterResolve=resolve});
 const exit=new Promise(resolve=>{exitResolve=resolve});
 let enteredOnce=false;
 let first;
 const wrapper={
  async getConnection(){
   const conn=await pool.getConnection();
   return {
    async execute(sql,args){
     // Only the journal reader is stubbed; GET_LOCK/RELEASE_LOCK
     // execute against independent real MariaDB connections.
     if(sql.startsWith("SELECT event_id,payload_digest,event_payload FROM foon_sync_pending_events")){
      if(!enteredOnce){enteredOnce=true;enterResolve();await exit}
      return [[]];
     }
     return conn.execute(sql,args);
    },
    release(){conn.release()},
    destroy(){conn.destroy()}
   };
  }
 };
 try{
  first=pushWithMariaDbDeviceLock({pool:wrapper,scope,maxEvents:1});
  await entered;
  await assert.rejects(
   ()=>pushWithMariaDbDeviceLock({pool:wrapper,scope,maxEvents:1}),
   /SYNC_PUSH_ALREADY_RUNNING/
  );
  exitResolve();
  assert.equal((await first).status,"idle");
  assert.equal((await pushWithMariaDbDeviceLock({pool:wrapper,scope,maxEvents:1})).status,"idle");
 }finally{
  exitResolve();
  // Never close the pool while an acquired lock is still in use.
  if(first)await first.catch(()=>{});
  await pool.end();
 }
});
