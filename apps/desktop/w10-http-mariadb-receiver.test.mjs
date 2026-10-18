// W10 pure unit-level HTTP contract test: real local TCP server, FAKE
// transactional MariaDB pool. Must run BEFORE the one-time real DB writer.
// No MySQL process, migrations, saved SQLite, Internet, or credentials.
import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID,randomBytes} from "node:crypto";
import {startW10HttpMySqlReceiver} from "./w10-http-mariadb-receiver.mjs";
import {deviceReceiptKey} from "../../lib/platform/edge-device-auth.mjs";
import {verifyCloudReceiptSignature} from "../../lib/platform/edge-sync-receipt-signature.mjs";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";

function fakePool(){
  const state={inbox:new Map(),orders:new Map()};
  return {state,async getConnection(){
    let inbox,orders;
    return {
      async beginTransaction(){
        inbox=new Map([...state.inbox].map(([k,v])=>[k,{...v}]));
        orders=new Map([...state.orders].map(([k,v])=>[k,{...v}]));
      },
      async execute(sql,params){
        if(sql.startsWith("INSERT INTO edge_sync_inbox")){
          const key=params[2]+":"+params[3];
          if(inbox.has(key)){const error=Error("duplicate");error.code="ER_DUP_ENTRY";throw error;}
          inbox.set(key,{tenant_id:params[0],branch_id:params[1],device_id:params[2],
            event_seq:params[3],event_kind:params[4],order_id:params[5],
            payload_sha256:params[6],receipt_id:params[7]});
          return [{affectedRows:1}];
        }
        if(sql.startsWith("SELECT tenant_id,branch_id,device_id,event_seq,event_kind")){
          return [[inbox.get(params[0]+":"+params[1])].filter(Boolean)];
        }
        if(sql.startsWith("INSERT INTO w10_http_fixture_orders")){
          if(orders.has(params[0]))throw Error("duplicate order");
          orders.set(params[0],{id:params[0],tenantId:params[1],branchId:params[2],
            deviceId:params[3],status:params[4],items:params[5],version:1});
          return [{affectedRows:1}];
        }
        if(sql.startsWith("SELECT status FROM w10_http_fixture_orders")){
          const row=orders.get(params[0]);
          return [[row&&row.tenantId===params[1]&&row.branchId===params[2]&&row.deviceId===params[3]?{status:row.status}:null].filter(Boolean)];
        }
        if(sql.startsWith("UPDATE w10_http_fixture_orders SET status=")){
          const row=orders.get(params[1]);
          if(!row)throw Error("missing");
          row.status=params[0];row.version++;
          return [{affectedRows:1}];
        }
        throw Error("W10_FAKE_POOL_UNKNOWN_SQL");
      },
      async commit(){state.inbox=inbox;state.orders=orders;},
      async rollback(){},
      release(){}
    };
  }};
}
const secret=()=>randomBytes(48).toString("hex");
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test("W10 receiver: HTTP authorization, signed receipts, loss after commit, restart and rollback-free replay",{timeout:30000},async()=>{
  const pool=fakePool(),masterKey=secret(),token=secret();
  const identity={tenantId:randomUUID(),branchId:randomUUID(),deviceId:randomUUID()};
  const orderId=randomUUID(),itemId=randomUUID();
  const event={...identity,eventSeq:1,orderId,kind:"created",
    payload:{id:orderId,branchId:identity.branchId,status:"new",items:[{id:itemId,quantity:2}]}};
  event.digest=eventDigest({seq:1,order_id:orderId,kind:"created",payload:event.payload});
  let server=await startW10HttpMySqlReceiver({pool,port:0,authorization:token,identity,masterKey});
  async function send(payload,auth=token){
    const response=await fetch("http://127.0.0.1:"+server.port+"/edge/sync",{
      method:"POST",headers:{authorization:"Bearer "+auth,"content-type":"application/json"},
      body:JSON.stringify(payload),signal:AbortSignal.timeout(4000)});
    return {status:response.status,body:await response.json()};
  }
  try{
    assert.equal((await send(event,"0".repeat(96))).status,401);
    assert.equal((await send({...event,tenantId:randomUUID()})).status,403);
    assert.equal((await send({...event,branchId:randomUUID()})).status,403);
    assert.equal((await send({...event,deviceId:randomUUID()})).status,403);
    assert.equal((await send({...event,digest:"0".repeat(64)})).status,400);
    assert.equal(pool.state.inbox.size,0);

    server.loseNextResponse();
    await assert.rejects(send(event));
    assert.equal(pool.state.inbox.size,1);
    assert.equal(pool.state.orders.size,1);

    await server.stop();
    server=await startW10HttpMySqlReceiver({pool,port:0,authorization:token,identity,masterKey});
    server.tamperReceipts(true);
    const forged=await send(event);
    assert.equal(forged.status,200);
    assert.equal(verifyCloudReceiptSignature(forged.body.receipt,deviceReceiptKey(masterKey,identity.deviceId)),false);
    server.tamperReceipts(false);
    const replay=await send(event);
    assert.equal(replay.status,200);
    assert.equal(replay.body.duplicate,true);
    assert.equal(verifyCloudReceiptSignature(replay.body.receipt,deviceReceiptKey(masterKey,identity.deviceId)),true);

    const changed={...event,payload:{...event.payload,items:[{id:itemId,quantity:3}]}};
    changed.digest=eventDigest({seq:1,order_id:orderId,kind:"created",payload:changed.payload});
    assert.equal((await send(changed)).status,409);
    assert.equal(pool.state.inbox.size,1);
    assert.equal(pool.state.orders.size,1);

    for(const [index,status] of ["preparing","ready","completed"].entries()){
      const payload={id:orderId,status,updatedAt:new Date().toISOString()};
      const next={...identity,eventSeq:index+2,orderId,kind:"status",payload};
      next.digest=eventDigest({seq:next.eventSeq,order_id:orderId,kind:"status",payload});
      assert.equal((await send(next)).status,201);
      assert.equal((await send(next)).status,200);
    }
    assert.equal(pool.state.orders.get(orderId).status,"completed");
    assert.equal(pool.state.orders.get(orderId).version,4);
    assert.equal(pool.state.inbox.size,4);
  }finally{
    await server.stop();
  }
});
