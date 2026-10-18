// W10-only loopback HTTP receiver backed by the existing real MariaDB
// edge_sync_inbox and a synthetic W10 business table. It reuses the
// production transaction/validation/receipt-signing modules, NOT the
// production HTTP route, device registry, catalog pricing or payment policy.
// Never deploy this test receiver, pass external URLs or bind to 0.0.0.0.
import http from "node:http";
import {createHash,timingSafeEqual} from "node:crypto";
import {mysqlEdgeInboxAdapter} from "../../lib/platform/edge-sync-mysql-adapter.mjs";
import {acceptAndSignEdgeEvent} from "../../lib/platform/edge-sync-service.mjs";
import {deviceReceiptKey} from "../../lib/platform/edge-device-auth.mjs";

const transitions={new:"preparing",preparing:"ready",ready:"completed"};
const reply=(res,status,body)=>{
  res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"});
  res.end(JSON.stringify(body));
};
async function receiveJson(req){
  const chunks=[];let bytes=0;
  for await(const part of req){
    bytes+=part.length;
    if(bytes>131072)throw Error("W10_TOO_LARGE");
    chunks.push(part);
  }
  try{
    const body=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!body||typeof body!=="object"||Array.isArray(body))throw Error("W10_JSON_REQUIRED");
    return body;
  }catch{throw Error("W10_JSON_REQUIRED");}
}

export async function startW10HttpMySqlReceiver({pool,port=0,authorization,identity,masterKey}){
  if(!pool||typeof pool.getConnection!=="function"||
     !Number.isSafeInteger(port)||port<0||port>65535||
     typeof authorization!=="string"||!/^[a-f0-9]{96}$/.test(authorization)||
     !identity||["tenantId","branchId","deviceId"].some(key=>typeof identity[key]!=="string"||!identity[key]))
    throw Error("W10_INVALID_RECEIVER_CONFIG");
  const signatureKey=deviceReceiptKey(masterKey,identity.deviceId);
  const expectedTokenHash=createHash("sha256").update(authorization).digest();
  let loseNext=false,tamper=false,closed=false;
  const adapter=mysqlEdgeInboxAdapter(pool,async(connection,e)=>{
    if(e.kind==="created"){
      if(e.payload.status!=="new"||!Array.isArray(e.payload.items)||!e.payload.items.length)
        throw Error("W10_INVALID_SYNTHETIC_CREATE");
      await connection.execute(
        "INSERT INTO w10_http_fixture_orders (order_id,tenant_id,branch_id,device_id,status,item_count) VALUES (?,?,?,?,?,?)",
        [e.orderId,e.tenantId,e.branchId,e.deviceId,"new",e.payload.items.reduce((n,item)=>n+item.quantity,0)]
      );
    }else{
      const [rows]=await connection.execute(
        "SELECT status FROM w10_http_fixture_orders WHERE order_id=? AND tenant_id=? AND branch_id=? AND device_id=? FOR UPDATE",
        [e.orderId,e.tenantId,e.branchId,e.deviceId]
      );
      if(rows.length!==1||transitions[rows[0].status]!==e.payload.status)
        throw Error("W10_STATUS_TRANSITION_REJECTED");
      await connection.execute(
        "UPDATE w10_http_fixture_orders SET status=?,version=version+1 WHERE order_id=? AND tenant_id=? AND branch_id=? AND device_id=?",
        [e.payload.status,e.orderId,e.tenantId,e.branchId,e.deviceId]
      );
    }
  });
  const server=http.createServer({requestTimeout:10000,headersTimeout:5000},async(req,res)=>{
    if(req.url!=="/edge/sync"||req.method!=="POST")return reply(res,404,{error:"W10_NOT_FOUND"});
    const token=/^Bearer ([a-f0-9]{96})$/.exec(req.headers.authorization||"")?.[1];
    const hash=token?createHash("sha256").update(token).digest():Buffer.alloc(0);
    if(hash.length!==expectedTokenHash.length||!timingSafeEqual(hash,expectedTokenHash))
      return reply(res,401,{error:"DEVICE_UNAUTHORIZED"});
    if(!/^application\/json(?:;|$)/i.test(req.headers["content-type"]||""))
      return reply(res,415,{error:"W10_JSON_REQUIRED"});
    try{
      const event=await receiveJson(req);
      const out=await acceptAndSignEdgeEvent(event,identity,adapter,signatureKey);
      if(loseNext&&[200,201].includes(out.status)){
        loseNext=false;
        res.destroy(); // after the MariaDB COMMIT but before delivering ACK
        return;
      }
      if(out.receipt){
        const receipt=tamper?{...out.receipt,signature:"0".repeat(64)}:out.receipt;
        return reply(res,out.status,{receipt,duplicate:out.duplicate??false});
      }
      return reply(res,out.status,{error:out.error});
    }catch(error){
      const code=error?.message;
      return reply(res,code==="W10_TOO_LARGE"?413:
        code==="W10_JSON_REQUIRED"?400:code==="W10_STATUS_TRANSITION_REJECTED"?409:503,
        {error:code==="W10_TOO_LARGE"||code==="W10_JSON_REQUIRED"?"W10_BAD_EVENT":
          code==="W10_STATUS_TRANSITION_REJECTED"?"EDGE_INVALID_STATUS_TRANSITION":"W10_TEST_RECEIVER_FAILED"});
    }
  });
  await new Promise((resolve,reject)=>{
    server.once("error",reject);
    server.listen(port,"127.0.0.1",resolve);
  });
  return {port:server.address().port,
    loseNextResponse(){loseNext=true;},
    tamperReceipts(value){tamper=Boolean(value);},
    async stop(){
      if(closed)return;
      closed=true;
      await new Promise((resolve,reject)=>{
        server.close(error=>error?reject(error):resolve());
        server.closeAllConnections();
      });
    }
  };
}
