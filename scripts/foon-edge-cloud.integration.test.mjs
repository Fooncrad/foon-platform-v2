import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {spawnSync,spawn} from "node:child_process";
import {mkdtemp,rm,writeFile,unlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {randomUUID,randomBytes} from "node:crypto";
import {receiveEdgeRequest} from "../lib/platform/edge-sync-http.mjs";
import {deviceTokenHash,deviceReceiptKey} from "../lib/platform/edge-device-auth.mjs";
import {verifyCloudReceiptSignature} from "../lib/platform/edge-sync-receipt-signature.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";
import {syncLocalOutbox} from "./foon-edge-sync-bridge.mjs";
import {readFile} from "node:fs/promises";
import {splitSqlStatements} from "./sql-statements.mjs";
import {hashOperatorPassword} from "./foon-edge-console-server.mjs";
import {freePort} from "./foon-edge-console-fixture.mjs";

test("device registry preserves foreign keys with legacy identity collations",async()=>{
 const url=new URL(process.env.EDGE_TEST_DATABASE_URL||"");assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_edge_test");
 const database="foon_edge_collation_"+randomBytes(8).toString("hex"),connection=await mysql.createConnection(url.href);let created=false;
 try{
  await connection.query("CREATE DATABASE `"+database+"`");created=true;await connection.query("USE `"+database+"`");
  await connection.query("CREATE TABLE tenants(id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci PRIMARY KEY) ENGINE=InnoDB");
  await connection.query("CREATE TABLE branches(id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY) ENGINE=InnoDB");
  await connection.query("CREATE TABLE users(id VARCHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci PRIMARY KEY) ENGINE=InnoDB");
  const statements=splitSqlStatements(await readFile("migrations/0075_edge_devices.sql","utf8"));
  for(const statement of statements)await connection.query(statement);
  for(const statement of statements)await connection.query(statement);
  const tenant=randomUUID(),branch=randomUUID(),actor=randomUUID();
  await connection.execute("INSERT INTO tenants(id) VALUES (?)",[tenant]);await connection.execute("INSERT INTO branches(id) VALUES (?)",[branch]);await connection.execute("INSERT INTO users(id) VALUES (?)",[actor]);
  await connection.execute("INSERT INTO edge_devices(id,tenant_id,branch_id,actor_user_id,name,token_hash) VALUES (?,?,?,?,?,?)",[randomUUID(),tenant,branch,actor,"Legacy fixture",deviceTokenHash(randomBytes(48).toString("hex"))]);
  await assert.rejects(connection.execute("INSERT INTO edge_devices(id,tenant_id,branch_id,actor_user_id,name,token_hash) VALUES (?,?,?,?,?,?)",[randomUUID(),tenant,randomUUID(),actor,"Rejected fixture",deviceTokenHash(randomBytes(48).toString("hex"))]),error=>error.code==="ER_NO_REFERENCED_ROW_2");
 }finally{if(created)await connection.query("DROP DATABASE `"+database+"`");await connection.end();}
});

test("real MySQL cloud sync is atomic, scoped, revocable and idempotent under concurrent retry",async()=>{
 const url=new URL(process.env.EDGE_TEST_DATABASE_URL||"");
 assert.equal(url.hostname,"127.0.0.1");assert.equal(url.pathname,"/foon_edge_test");
 const migrated=spawnSync(process.execPath,["scripts/migrate.mjs"],{encoding:"utf8",env:{...process.env,DATABASE_URL:url.href},timeout:60000});
 assert.equal(migrated.status,0,migrated.stderr);
 const pool=mysql.createPool({uri:url.href,connectionLimit:5,decimalNumbers:false,timezone:"Z"});
 const tenantId=randomUUID(),branchId=randomUUID(),actorUserId=randomUUID(),deviceId=randomUUID(),categoryId=randomUUID(),itemId=randomUUID();
 const token=randomBytes(48).toString("hex"),masterKey=randomBytes(48).toString("hex"),orderId=randomUUID();
 const options={pool,masterKey,plainTakeawayEnabled:true};
 const request=e=>new Request("https://cloud.example/api/edge/sync",{method:"POST",headers:{authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify(e)});
 const digest=e=>({...e,digest:eventDigest({seq:e.eventSeq,order_id:e.orderId,kind:e.kind,payload:e.payload})});
 const event=digest({tenantId,branchId,deviceId,eventSeq:1,orderId,kind:"created",payload:{id:orderId,branchId,status:"new",createdAt:new Date().toISOString(),items:[{id:itemId,quantity:2,expectedUnitCents:995,expectedCurrency:"SAR"}]}});
 try{
  await pool.execute("INSERT INTO tenants(id,slug,name,status) VALUES (?,?,?,'active')",[tenantId,"edge-"+tenantId,"Edge test"]);
  await pool.execute("INSERT INTO users(id,email,status) VALUES (?,?,'active')",[actorUserId,actorUserId+"@test.example"]);
  await pool.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'cashier','active')",[randomUUID(),tenantId,actorUserId]);
  await pool.execute("INSERT INTO branches(id,tenant_id,name,slug) VALUES (?,?,?,'main')",[branchId,tenantId,"Edge branch"]);
  const planId=randomUUID();await pool.execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,?,'Edge test','Edge test')",[planId,"edge-"+planId,"تجربة"]);
  for(const feature of ["pos","orders","kds"]){await pool.execute("INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category) VALUES (?,?,?,'test')",[feature,feature,feature]);await pool.execute("INSERT INTO package_plan_features(plan_id,feature_key,enabled) VALUES (?,?,TRUE)",[planId,feature]);}
  await pool.execute("INSERT INTO tenant_subscriptions(id,tenant_id,plan_id,status) VALUES (?,?,?,'active')",[randomUUID(),tenantId,planId]);
  await pool.execute("INSERT INTO restaurant_menu_categories(id,tenant_id,name) VALUES (?,?,'Drinks')",[categoryId,tenantId]);
  await pool.execute("INSERT INTO restaurant_menu_items(id,tenant_id,category_id,name,price,currency) VALUES (?,?,?,'Coffee',9.95,'SAR')",[itemId,tenantId,categoryId]);
  await pool.execute("INSERT INTO restaurant_resources(id,tenant_id,kind,name,status,data) VALUES (?,?,'menu_item','Coffee','active','{}')",[itemId,tenantId]);
  await pool.execute("INSERT INTO edge_devices(id,tenant_id,branch_id,actor_user_id,name,token_hash) VALUES (?,?,?,?,'Test device',?)",[deviceId,tenantId,branchId,actorUserId,deviceTokenHash(token)]);
  assert.equal((await receiveEdgeRequest(request(event),options)).status,403);
  await pool.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role,enabled) VALUES (?,?,?,?, 'cashier',TRUE)",[randomUUID(),tenantId,actorUserId,branchId]);
  for(const permission of ["pos.view","pos.create","orders.edit"])await pool.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,actorUserId,branchId,permission]);
  const first=await receiveEdgeRequest(request(event),options);assert.equal(first.status,201,JSON.stringify(await first.clone().json()));
  const receipt=(await first.json()).receipt;assert.equal(verifyCloudReceiptSignature(receipt,deviceReceiptKey(masterKey,deviceId)),true);
  await pool.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?, 'pos.create',FALSE)",[randomUUID(),tenantId,actorUserId,branchId]);
  const deniedReplay=await receiveEdgeRequest(request(event),options);assert.equal(deniedReplay.status,403);assert.equal((await deniedReplay.json()).receipt,undefined);
  await pool.execute("DELETE FROM employee_permission_grants WHERE tenant_id=? AND user_id=? AND permission_key='pos.create' AND allowed=FALSE",[tenantId,actorUserId]);
  const replay=await receiveEdgeRequest(request(event),options);assert.equal(replay.status,200);assert.deepEqual((await replay.json()).receipt,receipt);
  const retries=await Promise.all(Array.from({length:4},()=>receiveEdgeRequest(request(event),options)));assert.ok(retries.every(r=>r.status===200));
  const [[order]]=await pool.execute("SELECT total,status FROM restaurant_orders WHERE id=?",[orderId]);assert.equal(order.total,"19.90");assert.equal(order.status,"new");
  const [[counts]]=await pool.execute("SELECT (SELECT COUNT(*) FROM restaurant_orders WHERE id=?) AS orders,(SELECT COUNT(*) FROM edge_sync_inbox WHERE device_id=?) AS events",[orderId,deviceId]);assert.equal(Number(counts.orders),1);assert.equal(Number(counts.events),1);
  const changed=digest({...event,payload:{...event.payload,items:[{id:itemId,quantity:3}]}});assert.equal((await receiveEdgeRequest(request(changed),options)).status,409);
  assert.equal((await receiveEdgeRequest(request({...event,tenantId:randomUUID()}),options)).status,403);
  const groupId=randomUUID();await pool.execute("INSERT INTO restaurant_menu_option_groups(id,tenant_id,item_id,name,required) VALUES (?,?,?,'Required choice',TRUE)",[groupId,tenantId,itemId]);
  const secondId=randomUUID(),second=digest({...event,eventSeq:2,orderId:secondId,payload:{...event.payload,id:secondId}});
  assert.equal((await receiveEdgeRequest(request(second),options)).status,409);
  const [[rolledBack]]=await pool.execute("SELECT COUNT(*) AS n FROM edge_sync_inbox WHERE device_id=? AND event_seq=2",[deviceId]);assert.equal(Number(rolledBack.n),0);
  await pool.execute("UPDATE restaurant_menu_option_groups SET enabled=FALSE WHERE id=?",[groupId]);
  await pool.execute("UPDATE restaurant_menu_categories SET enabled=FALSE WHERE id=?",[categoryId]);
  assert.equal((await receiveEdgeRequest(request(second),options)).status,409);
  await pool.execute("UPDATE restaurant_menu_categories SET enabled=TRUE WHERE id=?",[categoryId]);
  await pool.execute("UPDATE restaurant_menu_items SET price=11.00 WHERE id=?",[itemId]);
  const stale=await receiveEdgeRequest(request(second),options);assert.equal(stale.status,409);assert.equal((await stale.json()).error,"EDGE_CATALOG_PRICE_CHANGED");
  await pool.execute("UPDATE restaurant_menu_items SET price=9.95 WHERE id=?",[itemId]);
  const kitchenActor=randomUUID(),kitchenDevice=randomUUID(),kitchenToken=randomBytes(48).toString("hex");
  await pool.execute("INSERT INTO users(id,email,status) VALUES (?,?,'active')",[kitchenActor,kitchenActor+"@test.example"]);
  await pool.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'kitchen','active')",[randomUUID(),tenantId,kitchenActor]);
  await pool.execute("INSERT INTO edge_devices(id,tenant_id,branch_id,actor_user_id,name,token_hash) VALUES (?,?,?,?,'Kitchen fixture',?)",[kitchenDevice,tenantId,branchId,kitchenActor,deviceTokenHash(kitchenToken)]);
  const kitchenRequest=e=>new Request("https://cloud.example/api/edge/sync",{method:"POST",headers:{authorization:"Bearer "+kitchenToken,"content-type":"application/json"},body:JSON.stringify(e)});
  const preparing=digest({tenantId,branchId,deviceId:kitchenDevice,eventSeq:1,orderId,kind:"status",payload:{id:orderId,status:"preparing",updatedAt:new Date().toISOString()}});
  await pool.execute("INSERT INTO employee_branch_assignments(id,tenant_id,user_id,branch_id,role,enabled) VALUES (?,?,?,?, 'kitchen',TRUE)",[randomUUID(),tenantId,kitchenActor,branchId]);
  for(const permission of ["kitchen.view","kitchen.edit"])await pool.execute("INSERT INTO employee_permission_grants(id,tenant_id,user_id,branch_id,permission_key,allowed) VALUES (?,?,?,?,?,TRUE)",[randomUUID(),tenantId,kitchenActor,branchId,permission]);
  const cooked=await receiveEdgeRequest(kitchenRequest(preparing),options);assert.equal(cooked.status,201);assert.equal(verifyCloudReceiptSignature((await cooked.json()).receipt,deviceReceiptKey(masterKey,kitchenDevice)),true);
  const cancelled=digest({...preparing,eventSeq:2,payload:{...preparing.payload,status:"cancelled"}});assert.equal((await receiveEdgeRequest(kitchenRequest(cancelled),options)).status,403);
  const kitchenCreate=digest({...second,deviceId:kitchenDevice});assert.equal((await receiveEdgeRequest(kitchenRequest(kitchenCreate),options)).status,403);
  // Actual Next.js HTTP route + SQLite gateway, not a simulated cloud adapter.
  if(process.env.EDGE_TEST_HTTP==="true"){
   const dir=await mkdtemp(join(tmpdir(),"foon-edge-mysql-e2e-"));
   const localPort=21000+Math.floor(Math.random()*15000),localUrl="http://127.0.0.1:"+localPort,cloudOrigin="http://127.0.0.1:3114";
   const localToken=randomBytes(48).toString("hex"),ackSecret=randomBytes(48).toString("hex"),signingSecret=deviceReceiptKey(masterKey,deviceId);
   let cloud,local,consoleProcess;
   const localEnv={...process.env,FOON_LAN_PORT:String(localPort),FOON_LAN_DB:join(dir,"orders.sqlite"),FOON_LAN_TOKEN:localToken,FOON_EDGE_ACK_SECRET:ackSecret,FOON_EDGE_DEVICE_ID:deviceId,FOON_EDGE_RECEIPT_SIGNING_KEY:signingSecret};
   const localRequest=(path,method="GET",body)=>fetch(localUrl+path,{method,headers:{authorization:"Bearer "+localToken,"content-type":"application/json"},body:body?JSON.stringify(body):undefined});
   const stop=async child=>{if(!child||child.exitCode!==null)return;await new Promise(resolve=>{child.once("exit",resolve);child.kill();});};
   async function ready(fn){for(let i=0;i<100;i++){try{if((await fn()).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw Error("TEST_SERVER_NOT_READY");}
   const startLocal=async()=>{local=spawn(process.execPath,["scripts/foon-lan-sqlite.mjs"],{env:localEnv,stdio:"ignore"});await ready(()=>localRequest("/health"));};
   try{
    cloud=spawn(process.execPath,["node_modules/next/dist/bin/next","start","-p","3114"],{env:{...process.env,DATABASE_URL:url.href,FOON_EDGE_MASTER_RECEIPT_KEY:masterKey,FOON_EDGE_PLAIN_TAKEAWAY_ENABLED:"true"},stdio:"ignore"});
    await ready(()=>fetch(cloudOrigin+"/api/health"));await startLocal();
    const prepId=randomUUID();
    await pool.execute("INSERT INTO restaurant_orders(id,tenant_id,branch_id,created_by,channel,status,subtotal,total,dining_snapshot,party_size) VALUES (?,?,?,?,'dine_in','new',11.95,11.95,?,2)",[prepId,tenantId,branchId,actorUserId,JSON.stringify({name:"طاولة 7",sectionName:"الصالة"})]);
    await pool.execute("INSERT INTO restaurant_order_items(id,tenant_id,order_id,menu_item_id,item_name,quantity,unit_price,line_total,options_snapshot) VALUES (?,?,?,?,'Coffee',1,11.95,11.95,?)",[randomUUID(),tenantId,prepId,itemId,JSON.stringify([{name:"حليب إضافي",price:2}])]);
    const realCatalog=await fetch(cloudOrigin+"/api/edge/catalog",{headers:{authorization:"Bearer "+token}});assert.equal(realCatalog.status,200);
    const prep=(await realCatalog.json()).orders.find(order=>order.id===prepId);assert.equal(prep.location,"الصالة · طاولة 7");assert.deepEqual(prep.items[0].options,["حليب إضافي"]);
    const offlineId=randomUUID();
    const config={localUrl,localToken,ackSecret,cloudUrl:"https://cloud.example/api/edge/sync",cloudToken:token,tenantId,branchId,deviceId,signingSecret};
    // Use a fresh device event sequence; the direct API fixtures consumed seq 1.
    const httpDeviceId=randomUUID();await pool.execute("UPDATE edge_devices SET id=? WHERE id=?",[httpDeviceId,deviceId]);
    config.deviceId=httpDeviceId;config.signingSecret=deviceReceiptKey(masterKey,httpDeviceId);
    localEnv.FOON_EDGE_DEVICE_ID=httpDeviceId;localEnv.FOON_EDGE_RECEIPT_SIGNING_KEY=config.signingSecret;
    await stop(local);await startLocal();
    assert.equal((await localRequest("/orders","POST",{id:offlineId,branchId,items:[{id:itemId,quantity:2,expectedUnitCents:995,expectedCurrency:"SAR"}]})).status,201);
    await stop(local);await startLocal();
    const offline=await syncLocalOutbox({...config,fetchImpl:async(u,o)=>new URL(u).hostname==="cloud.example"?Promise.reject(Error("offline")):fetch(u,o)});assert.equal(offline.acked,0);
    let loseAck=true;
    const transport=async(u,o)=>{const target=new URL(u);if(target.hostname==="cloud.example")return fetch(cloudOrigin+target.pathname,o);if(target.pathname==="/outbox/ack"&&loseAck){loseAck=false;return new Response(null,{status:503});}return fetch(u,o);};
    assert.equal((await syncLocalOutbox({...config,fetchImpl:transport})).retry,1);
    assert.equal((await syncLocalOutbox({...config,fetchImpl:transport})).acked,1);
    const [[one]]=await pool.execute("SELECT COUNT(*) AS n FROM restaurant_orders WHERE id=?",[offlineId]);assert.equal(Number(one.n),1);
    assert.equal((await (await localRequest("/health")).json()).pending,0);
    await stop(local);local=null;
    const consolePort=await freePort(),consoleOrigin="http://127.0.0.1:"+consolePort,offlineFlag=join(dir,"cloud-offline"),usersFile=join(dir,"operators.json"),password=randomBytes(16).toString("hex");
    const users=[{username:"cashier",role:"cashier",tenantId,branchId,deviceId:httpDeviceId,cloudToken:token,signingSecret:config.signingSecret,passwordHash:await hashOperatorPassword(password)}];
    await writeFile(usersFile,JSON.stringify(users),{mode:0o600});
    const preload="import {existsSync} from 'node:fs';const original=globalThis.fetch;globalThis.fetch=async(u,o)=>{const target=new URL(u);if(target.hostname==='cloud.example'){if(existsSync("+JSON.stringify(offlineFlag)+"))throw new TypeError('offline');return original(new URL(target.pathname,"+JSON.stringify(cloudOrigin)+"),o);}return original(u,o);};";
    const startConsole=async()=>{consoleProcess=spawn(process.execPath,["--import","data:text/javascript,"+encodeURIComponent(preload),"scripts/start-edge-console.mjs"],{env:{...localEnv,FOON_EDGE_USERS_FILE:usersFile,FOON_EDGE_CATALOG_CACHE:join(dir,"catalog.json"),FOON_EDGE_CLOUD_SYNC_URL:"https://cloud.example/api/edge/sync",FOON_EDGE_CONSOLE_PORT:String(consolePort),FOON_EDGE_CONSOLE_ORIGIN:consoleOrigin},stdio:"ignore"});await ready(()=>fetch(consoleOrigin));};
    await startConsole();
    async function loginConsole(){const r=await fetch(consoleOrigin+"/api/login",{method:"POST",headers:{origin:consoleOrigin,"content-type":"application/json"},body:JSON.stringify({username:"cashier",password})});assert.equal(r.status,200);return {cookie:r.headers.get("set-cookie").split(";")[0],csrf:(await r.json()).csrf};}
    const session=await loginConsole();
    await writeFile(offlineFlag,"");await stop(consoleProcess);consoleProcess=null;await startConsole();
    const offlineSession=await loginConsole();assert.notEqual(offlineSession.cookie,session.cookie);
    const restartedId=randomUUID();
    const saved=await fetch(consoleOrigin+"/api/orders",{method:"POST",headers:{origin:consoleOrigin,"content-type":"application/json",cookie:offlineSession.cookie,"x-foon-csrf":offlineSession.csrf},body:JSON.stringify({id:restartedId,items:[{id:itemId,quantity:1}]})});assert.equal(saved.status,201);
    const [[beforeReconnect]]=await pool.execute("SELECT COUNT(*) AS n FROM restaurant_orders WHERE id=?",[restartedId]);assert.equal(Number(beforeReconnect.n),0);
    await unlink(offlineFlag);
    let delivered=false;for(let i=0;i<100;i++){const [[row]]=await pool.execute("SELECT COUNT(*) AS n FROM restaurant_orders WHERE id=?",[restartedId]);if(Number(row.n)===1){delivered=true;break;}await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(delivered,true);
    await stop(consoleProcess);consoleProcess=null;
    await pool.execute("UPDATE edge_devices SET id=? WHERE id=?",[deviceId,httpDeviceId]);
   }finally{await stop(consoleProcess);await stop(local);await stop(cloud);await rm(dir,{recursive:true,force:true});}
  }
  await pool.execute("UPDATE edge_devices SET enabled=FALSE WHERE id=?",[deviceId]);
  const revoked=await receiveEdgeRequest(request(event),options);assert.equal(revoked.status,401);assert.equal((await revoked.json()).receipt,undefined);
 }finally{await pool.end();}
});
