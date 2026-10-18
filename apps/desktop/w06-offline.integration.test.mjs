// W06 isolated simulation: gateway cannot dial external TCP; synthetic WAL
// orders/outbox must survive a forced child-process stop and a fresh token.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {randomUUID,randomBytes} from 'node:crypto';
import {mkdtemp,rm,access,writeFile} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const gateway=join(root,'scripts/foon-lan-sqlite.mjs');
const inspector=join(root,'apps/desktop/w06-inspect-sqlite.mjs');
const guard=join(root,'apps/desktop/w06-block-external.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){
  const listener=createServer();
  await new Promise((ok,bad)=>listener.once('error',bad).listen(0,'127.0.0.1',ok));
  const p=listener.address().port;
  await new Promise(ok=>listener.close(ok));
  return p;
}
function start(c){
  return spawn(process.execPath,['--require',guard,gateway],{
    cwd:root,windowsHide:true,stdio:'ignore',env:{
      ...process.env,
      FOON_LAN_DB:c.db,FOON_LAN_HOST:'127.0.0.1',
      FOON_LAN_PORT:String(c.port),FOON_LAN_TOKEN:c.token,
      FOON_EDGE_ACK_SECRET:randomBytes(48).toString('hex'),
      FOON_EDGE_TENANT_ID:'',FOON_EDGE_BRANCH_ID:c.branch,
      FOON_EDGE_DEVICE_ID:'',FOON_EDGE_RECEIPT_KEYS:'{}',
      FOON_EDGE_RECEIPT_SIGNING_KEY:'',FOON_EDGE_CLOUD_SYNC_URL:'',
      FOON_W06_EXTERNAL_ATTEMPT_MARKER:c.marker
    }
  });
}
async function call(c,path,method='GET',body){
  const response=await fetch('http://127.0.0.1:'+c.port+path,{
    method,headers:{'content-type':'application/json',authorization:'Bearer '+c.token},
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(3500)
  });
  return {status:response.status,body:await response.json()};
}
async function ready(c,p){
  for(let i=0;i<100;i++){
    if(p.exitCode!==null||p.signalCode!==null)throw Error('W06_GATEWAY_EXITED');
    try{const state=await call(c,'/health');if(state.status===200&&state.body.storage==='sqlite-wal-full')return;}catch{}
    await pause(75);
  }
  throw Error('W06_GATEWAY_NOT_READY');
}
async function stop(p,signal='SIGTERM'){
  if(!p||p.exitCode!==null||p.signalCode!==null)return;
  const closed=new Promise(resolve=>p.once('exit',resolve));
  p.kill(signal);
  await Promise.race([closed,pause(3000)]);
  if(p.exitCode===null&&p.signalCode===null){
    p.kill('SIGKILL');await Promise.race([closed,pause(3000)]);
  }
  assert(!(p.exitCode===null&&p.signalCode===null),'child must be stopped');
}

test('W06 offline-only: synthetic orders, 100 Outbox events, idempotence and crash/restart integrity',{
  timeout:90000
},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'foon-w06-offline-'));
  const c={port:await freePort(),token:randomBytes(48).toString('hex'),
    db:join(dir,'orders.sqlite'),branch:randomUUID(),marker:join(dir,'external-attempt.txt')};
  let p;
  try{
    p=start(c);await ready(c,p);
    const orderIds=Array.from({length:25},()=>randomUUID());
    for(const id of orderIds){
      const payload={id,branchId:c.branch,items:[{
        id:randomUUID(),quantity:1,expectedUnitCents:950,expectedCurrency:'SAR'
      }]};
      const created=await call(c,'/orders','POST',payload);
      assert.equal(created.status,201);
      const replay=await call(c,'/orders','POST',payload);
      assert.equal(replay.status,200,'replay is idempotent');
      assert.equal(replay.body.duplicate,true);
      for(const status of ['preparing','ready','completed']){
        const advanced=await call(c,'/orders/'+id+'/status','PATCH',{status});
        assert.equal(advanced.status,200);
      }
    }
    assert.equal((await call(c,'/health')).body.pending,100);
    const wrong=await call(c,'/orders','POST',{
      id:randomUUID(),branchId:randomUUID(),
      items:[{id:randomUUID(),quantity:1,expectedUnitCents:950}]
    });
    assert.equal(wrong.status,400,'foreign synthetic branch fails closed');
    await stop(p,'SIGKILL');p=null;
    const inspection=spawnSync(process.execPath,[inspector,c.db],{
      cwd:root,windowsHide:true,encoding:'utf8',timeout:12000
    });
    assert.equal(inspection.status,0,inspection.stderr);
    const disk=JSON.parse(inspection.stdout);
    assert.deepEqual(disk,{healthy:true,orders:25,events:100,pending:100});

    // New credentials on each startup, same SQLite file and synthetic branch.
    c.token=randomBytes(48).toString('hex');
    p=start(c);await ready(c,p);
    const rows=await call(c,'/orders');
    assert.equal(rows.body.orders.length,25);
    assert(rows.body.orders.every(o=>o.status==='completed'&&o.pending_events===4));
    assert.equal((await call(c,'/outbox')).body.events.length,100);
    assert.equal((await call(c,'/health')).body.pending,100);
    await stop(p);p=null;
    try{await access(c.marker);assert.fail('gateway attempted external TCP');}
    catch(e){assert.equal(e.code,'ENOENT');}
  }finally{
    await stop(p);
    await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:150});
  }
});


test('W06: corrupt SQLite file is reported unhealthy without rewriting the existing file',{
  timeout:15000
},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'foon-w06-corrupt-'));
  const db=join(dir,'orders.sqlite');
  const sentinel='not-a-sqlite-database-KEEP-THIS-INPUT';
  try{
    await writeFile(db,sentinel);
    const attempt=spawnSync(process.execPath,[inspector,db],{
      cwd:root,windowsHide:true,encoding:'utf8',timeout:9000
    });
    assert.notEqual(attempt.status,0,'corrupt SQLite must not pass integrity inspection');
    const check=await import('node:fs/promises');
    assert.equal(await check.readFile(db,'utf8'),sentinel,'inspector must not modify corrupt data');
  }finally{
    await rm(dir,{recursive:true,force:true});
  }
});
