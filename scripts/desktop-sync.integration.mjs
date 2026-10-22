// Runs only inside the fresh Windows smoke fixture; never uses a configured service.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {once} from 'node:events';
import net from 'node:net';
import https from 'node:https';
import mysql from 'mysql2/promise';
import {syncDesktopBatch} from '../lib/platform/desktop-sync-worker.mjs';
import {queueDesktopOrderEvent} from '../lib/platform/desktop-sync-outbox.mjs';
import {receiveEdgeRequest} from '../lib/platform/edge-sync-http.mjs';
import {readEdgeCatalog} from '../lib/platform/edge-catalog-http.mjs';
import {deviceTokenHash,deviceReceiptKey} from '../lib/platform/edge-device-auth.mjs';
const url=new URL(process.env.DESKTOP_SYNC_TEST_DATABASE_URL||'');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/foon_windows_shell_test');
const scratch=process.env.DESKTOP_SYNC_TEST_WORK_DIR;
assert(scratch&&path.basename(scratch).startsWith('foon-windows-shell-'));
const children=new Set();let server,local,cloud,loseAck=false;
async function port(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const p=s.address().port;await new Promise(resolve=>s.close(resolve));return p;}
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const tenantId=randomUUID(),branchId=randomUUID(),actorUserId=randomUUID(),deviceId=randomUUID(),categoryId=randomUUID(),itemId=randomUUID(),planId=randomUUID();
const token=randomBytes(48).toString('hex'),masterKey=randomBytes(48).toString('hex');
const config={cloudUrl:'https://cloud.example/api/edge/sync',tenantId,branchId,actorUserId,deviceId,token,receiptKey:deviceReceiptKey(masterKey,deviceId)};
try{
 local=mysql.createPool({uri:url.href,connectionLimit:8,timezone:'Z',decimalNumbers:true});
 await local.query('CREATE DATABASE foon_windows_cloud_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
 const cloudUrl=new URL(url);cloudUrl.pathname='/foon_windows_cloud_test';
 const migrations=spawnSync(process.execPath,['scripts/migrate.mjs'],{encoding:'utf8',env:{...process.env,DATABASE_URL:cloudUrl.href},windowsHide:true});
 if(migrations.status!==0){await writeFile(path.join(scratch,'private-sync-migration.log'),migrations.stderr);throw Error('CLOUD_FIXTURE_MIGRATION_FAILED');}
 cloud=mysql.createPool({uri:cloudUrl.href,connectionLimit:8,timezone:'Z',decimalNumbers:true});
 for(const pool of [local,cloud]){
  await pool.execute("INSERT INTO tenants(id,slug,name,status) VALUES (?,?,?,'active')",[tenantId,'desktop-'+tenantId,'Desktop Sync Fixture']);
  await pool.execute("INSERT INTO users(id,email,status) VALUES (?,?,'active')",[actorUserId,actorUserId+'@test.example']);
  await pool.execute("INSERT INTO memberships(id,tenant_id,user_id,role,status) VALUES (?,?,?,'owner','active')",[randomUUID(),tenantId,actorUserId]);
  await pool.execute("INSERT INTO branches(id,tenant_id,name,slug) VALUES (?,?,?,'main')",[branchId,tenantId,'Main']);
  await pool.execute("INSERT INTO package_plans(id,code,name_ar,name_en,name_fr) VALUES (?,?,?,'Desktop','Desktop')",[planId,'desktop-'+planId,'تجربة']);
  for(const feature of ['pos','orders','kds','digital_menu']){
   await pool.execute("INSERT IGNORE INTO package_features(feature_key,name_ar,name_en,category) VALUES (?,?,?,'test')",[feature,feature,feature]);
   await pool.execute('INSERT INTO package_plan_features(plan_id,feature_key,enabled) VALUES (?,?,TRUE)',[planId,feature]);
  }
  await pool.execute("INSERT INTO tenant_subscriptions(id,tenant_id,plan_id,status) VALUES (?,?,?,'active')",[randomUUID(),tenantId,planId]);
  await pool.execute("INSERT INTO restaurant_menu_categories(id,tenant_id,name) VALUES (?,?,'Drinks')",[categoryId,tenantId]);
  await pool.execute("INSERT INTO restaurant_menu_items(id,tenant_id,category_id,name,price,currency) VALUES (?,?,?,'Coffee',9.95,'SAR')",[itemId,tenantId,categoryId]);
  await pool.execute("INSERT INTO restaurant_resources(id,tenant_id,kind,name,status,data) VALUES (?,?,'menu_item','Coffee','active','{}')",[itemId,tenantId]);
 }
 await cloud.execute("INSERT INTO edge_devices(id,tenant_id,branch_id,actor_user_id,name,token_hash) VALUES (?,?,?,?,'Desktop test',?)",[deviceId,tenantId,branchId,actorUserId,deviceTokenHash(token)]);
 const certificate=path.join(scratch,'fixture-cert.pem'),key=path.join(scratch,'fixture-key.pem');
 const openssl=spawnSync('C:/Program Files/Git/usr/bin/openssl.exe',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',certificate,'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1'],{windowsHide:true,stdio:'ignore'});
 assert.equal(openssl.status,0);
 const ca=await readFile(certificate);
 server=https.createServer({cert:ca,key:await readFile(key)},async(req,res)=>{
  try{
   const parts=[];for await(const part of req)parts.push(part);
   const request=new Request('https://cloud.example'+req.url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:Buffer.concat(parts)}:{})});
   const response=req.url==='/api/edge/catalog'?await readEdgeCatalog(request,{pool:cloud,enabled:true}):await receiveEdgeRequest(request,{pool:cloud,masterKey,plainTakeawayEnabled:true});
   if(loseAck&&req.method==='POST'&&response.ok){loseAck=false;req.socket.destroy();return;}
   res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
  }catch{res.writeHead(500);res.end('{}');}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 // Test transport pins the fresh loopback fixture and validates its own TLS CA.
 const fetchFixture=(input,options={})=>new Promise((resolve,reject)=>{
  const supplied=new URL(input);assert.equal(supplied.origin,'https://cloud.example');
  const req=https.request({hostname:'127.0.0.1',port:server.address().port,path:supplied.pathname,method:options.method||'GET',headers:options.headers,ca,rejectUnauthorized:true,signal:options.signal},res=>{
   const parts=[];res.on('data',part=>parts.push(part));res.on('end',()=>resolve(new Response(Buffer.concat(parts),{status:res.statusCode,headers:res.headers})));
  });req.on('error',reject);if(options.body)req.write(options.body);req.end();
 });
 const sync=async(device=config)=>{for(let attempt=0;attempt<300;attempt++){const result=await syncDesktopBatch(local,device,{fetchImpl:fetchFixture});if(!result.busy)return result;await delay(100);}throw Error("TEST_SYNC_LOCK_TIMEOUT");};
 await sync();
 const cookieToken=randomBytes(32).toString('base64url');
 await local.execute('INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))',[randomUUID(),actorUserId,createHash('sha256').update(cookieToken).digest('hex')]);
 const appPort=await port(),origin='http://127.0.0.1:'+appPort;
 const startSite=async()=>{
  const app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(appPort)],{windowsHide:true,env:{...process.env,DATABASE_URL:url.href,APP_URL:origin,FOON_DESKTOP_SYNC_CONFIG:JSON.stringify(config)},stdio:['ignore','ignore','ignore']});
  children.add(app);app.once('exit',()=>children.delete(app));
  let ready=false;for(let attempt=0;attempt<120;attempt++){try{const response=await fetch(origin+'/api/health');if(response.ok){ready=true;break;}}catch{}await delay(250);}assert(ready);
  return app;
 };
 let app=await startSite();
 const call=async(method,body)=>{
  const response=await fetch(origin+'/api/restaurant/operations/pos',{method,headers:{origin,'content-type':'application/json',cookie:'foon_session='+cookieToken,'x-foon-tenant':tenantId,'x-foon-branch':branchId},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
 };
 const create=()=>call('POST',{branchId,channel:'takeaway',requestKey:randomUUID(),items:[{id:itemId,quantity:2}]});
 const first=await create();assert.equal(first.status,201,JSON.stringify(first.body));
 const orderId=first.body.id;
 let [[queued]]=await local.execute('SELECT * FROM desktop_sync_outbox WHERE order_id=?',[orderId]);assert.equal(queued.state,'pending');
 const payloadBefore=queued.payload,digestBefore=queued.digest;
 loseAck=true;
 assert.equal((await sync()).retrying,1);
 const [[cloudCount]]=await cloud.execute('SELECT COUNT(*) AS n FROM restaurant_orders WHERE id=?',[orderId]);assert.equal(cloudCount.n,1);
 await local.end();local=mysql.createPool({uri:url.href,connectionLimit:8,timezone:'Z',decimalNumbers:true});
 const stopped=once(app,'exit');app.kill();await stopped;app=await startSite();
 [[queued]]=await local.execute('SELECT * FROM desktop_sync_outbox WHERE order_id=?',[orderId]);assert.equal(queued.payload,payloadBefore);assert.equal(queued.digest,digestBefore);assert.equal(queued.state,'retrying');
 await local.execute('UPDATE desktop_sync_outbox SET next_attempt_at=NULL WHERE order_id=?',[orderId]);
 assert.equal((await sync()).synced,1);
 const [[counts]]=await cloud.query('SELECT (SELECT COUNT(*) FROM restaurant_orders WHERE id=?) AS orders,(SELECT COUNT(*) FROM edge_sync_inbox WHERE device_id=?) AS events',[orderId,deviceId]);assert.equal(counts.orders,1);assert.equal(counts.events,1);
 console.log('PASS original POS API commits durable outbox; TLS ACK loss and actual server restart cause exactly one cloud order and receipt');
 await cloud.execute('UPDATE edge_devices SET enabled=FALSE WHERE id=?',[deviceId]);
 const beforeBlock=await create();assert.equal(beforeBlock.status,201);
 await assert.rejects(()=>sync(),/AUTHORIZATION_REQUIRED/);
 const [[before]]=await local.query('SELECT COUNT(*) AS n FROM restaurant_orders WHERE tenant_id=?',[tenantId]);
  assert.equal((await create()).status,409);
 const [[after]]=await local.query('SELECT COUNT(*) AS n FROM restaurant_orders WHERE tenant_id=?',[tenantId]);assert.equal(after.n,before.n);
 await cloud.execute('UPDATE edge_devices SET enabled=TRUE WHERE id=?',[deviceId]);
 assert.equal((await sync()).synced,1);
 console.log('PASS device revocation blocks new local writes without partial orders and preserves the pending event');
 const updated=await call('PATCH',{id:orderId,version:1,status:'preparing'});assert.equal(updated.status,200,JSON.stringify(updated.body));
 assert.equal((await sync()).synced,1);
 const [[status]]=await cloud.execute('SELECT status,total FROM restaurant_orders WHERE id=?',[orderId]);assert.equal(status.status,'preparing');assert.equal(Number(status.total),19.90);
 await call('PATCH',{id:orderId,version:2,status:'ready'});
 await cloud.execute("UPDATE restaurant_orders SET status='ready',version=version+1 WHERE id=?",[orderId]);
 assert.equal((await sync()).conflicts,1);
 [[queued]]=await local.execute("SELECT * FROM desktop_sync_outbox WHERE order_id=? AND state='conflict'",[orderId]);assert.equal(queued.last_error,'EDGE_CONCURRENT_ORDER_UPDATE');
 console.log('PASS original order status sync and concurrent cloud edits preserve an explicit conflict');
 // A second registered device exercises the checkout conflict independently of the blocked stream.
 const config2={...config,deviceId:randomUUID(),token:randomBytes(48).toString('hex')};config2.receiptKey=deviceReceiptKey(masterKey,config2.deviceId);
 await cloud.execute("INSERT INTO edge_devices(id,tenant_id,branch_id,actor_user_id,name,token_hash) VALUES (?,?,?,?,'Second device',?)",[config2.deviceId,tenantId,branchId,actorUserId,deviceTokenHash(config2.token)]);
 await sync(config2);
 const other=await create();assert.equal(other.status,201,JSON.stringify(other.body));
 const connection=await local.getConnection();try{await connection.beginTransaction();await queueDesktopOrderEvent(connection,{tenantId,actorUserId,orderId:other.body.id,kind:'created'},config2);await connection.commit();}finally{connection.release();}
 await cloud.execute("INSERT INTO restaurant_resources(id,tenant_id,kind,name,status,data) VALUES (?,?,'storefront_config','Policy','active',?)",[randomUUID(),tenantId,JSON.stringify({vatEnabled:'yes',vatRate:15})]);
 assert.equal((await sync(config2)).conflicts,1);
 const [[totalConflict]]=await local.execute('SELECT state,last_error FROM desktop_sync_outbox WHERE device_id=?',[config2.deviceId]);assert.equal(totalConflict.last_error,'EDGE_CHECKOUT_TOTAL_CHANGED');
 const [[notInserted]]=await cloud.execute('SELECT COUNT(*) AS n FROM restaurant_orders WHERE id=?',[other.body.id]);assert.equal(notInserted.n,0);
 const [[noInbox]]=await cloud.execute('SELECT COUNT(*) AS n FROM edge_sync_inbox WHERE device_id=?',[config2.deviceId]);assert.equal(noInbox.n,0);
 console.log('PASS changed cloud VAT/checkout total rejects atomically without a cloud order or false local ACK');
}finally{
 for(const child of children)child.kill();
 await local?.end();await cloud?.end();
 if(server)await new Promise(resolve=>server.close(resolve));
}
