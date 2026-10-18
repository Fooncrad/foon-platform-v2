// W07 TEST-ONLY fake central receiver: never deployed, bundled, or connected to MySQL.
// Its SQLite inbox and synthetic orders are created in a fresh disposable test directory.
import {DatabaseSync} from "node:sqlite";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {eventDigest} from "../../scripts/foon-edge-sync-contract.mjs";
import {signCloudReceipt} from "../../lib/platform/edge-sync-receipt-signature.mjs";

const transitions={new:["preparing","cancelled"],preparing:["ready","cancelled"],
 ready:["completed","cancelled"],completed:[],cancelled:[]};
function matches(a,b){
 if(typeof a!=="string"||typeof b!=="string")return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
export function createSandboxReceiver({dbPath,deviceId,tenantId,branchId,authToken,receiptKey}){
 if(typeof dbPath!=="string"||!dbPath||[deviceId,tenantId,branchId].some(x=>typeof x!=="string"||!x)||
   ![authToken,receiptKey].every(x=>typeof x==="string"&&x.length>=32))
   throw Error("W07_INVALID_SANDBOX_CONFIG");
 const db=new DatabaseSync(dbPath);
 db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
 CREATE TABLE IF NOT EXISTS inbox (
   device_id TEXT NOT NULL, event_seq INTEGER NOT NULL, digest TEXT NOT NULL,
   receipt TEXT NOT NULL, order_id TEXT NOT NULL, kind TEXT NOT NULL,
   PRIMARY KEY(device_id,event_seq)
 );
 CREATE TABLE IF NOT EXISTS orders (
   id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL,
   status TEXT NOT NULL
 );`);
 const getInbox=db.prepare("SELECT digest,receipt,order_id,kind FROM inbox WHERE device_id=? AND event_seq=?");
 const insertInbox=db.prepare("INSERT INTO inbox(device_id,event_seq,digest,receipt,order_id,kind) VALUES(?,?,?,?,?,?)");
 const getOrder=db.prepare("SELECT * FROM orders WHERE id=?");
 const insertOrder=db.prepare("INSERT INTO orders(id,tenant_id,branch_id,status) VALUES(?,?,?,?)");
 const updateOrder=db.prepare("UPDATE orders SET status=? WHERE id=?");
 function accept(input,bearer){
  if(!matches(bearer,authToken))return {status:401,body:{error:"W07_UNAUTHORIZED"}};
  if(input?.deviceId!==deviceId||input?.tenantId!==tenantId||input?.branchId!==branchId)
   return {status:403,body:{error:"W07_SCOPE_FORBIDDEN"}};
  if(!Number.isSafeInteger(input?.eventSeq)||input.eventSeq<1||
     typeof input?.orderId!=="string"||!input.orderId||
     !["created","status"].includes(input.kind)||
     !input.payload||typeof input.payload!=="object"||Array.isArray(input.payload)||
     input.payload.id!==input.orderId)
   return {status:400,body:{error:"W07_INVALID_EVENT"}};
  let digest;
  try{digest=eventDigest({seq:input.eventSeq,order_id:input.orderId,kind:input.kind,payload:input.payload});}
  catch{return {status:400,body:{error:"W07_INVALID_EVENT"}};}
  if(input.digest!==digest)return {status:409,body:{error:"EDGE_IDEMPOTENCY_CONFLICT"}};
  const old=getInbox.get(deviceId,input.eventSeq);
  if(old){
   if(old.digest!==digest||old.order_id!==input.orderId||old.kind!==input.kind)
    return {status:409,body:{error:"EDGE_IDEMPOTENCY_CONFLICT"}};
   return {status:200,body:{receipt:JSON.parse(old.receipt),duplicate:true}};
  }
  try{
   db.exec("BEGIN IMMEDIATE");
   // Re-check inside the transaction: unique event key and mutation share one commit.
   const existing=getInbox.get(deviceId,input.eventSeq);
   if(existing){
    db.exec("ROLLBACK");
    return existing.digest===digest&&existing.order_id===input.orderId&&existing.kind===input.kind?
      {status:200,body:{receipt:JSON.parse(existing.receipt),duplicate:true}}:
      {status:409,body:{error:"EDGE_IDEMPOTENCY_CONFLICT"}};
   }
   const row=getOrder.get(input.orderId);
   if(input.kind==="created"){
    if(input.payload.branchId!==branchId||input.payload.status!=="new"||row)
      {db.exec("ROLLBACK");return {status:409,body:{error:"EDGE_ORDER_ID_CONFLICT"}};}
    insertOrder.run(input.orderId,tenantId,branchId,"new");
   }else{
    const next=input.payload.status;
    if(!row||row.tenant_id!==tenantId||row.branch_id!==branchId||
      typeof next!=="string"||!transitions[row.status]?.includes(next)){
      db.exec("ROLLBACK");return {status:409,body:{error:"EDGE_INVALID_STATUS_TRANSITION"}};
    }
    updateOrder.run(next,input.orderId);
   }
   const receipt=signCloudReceipt({
    receiptId:randomUUID(),deviceId,eventSeq:input.eventSeq,
    orderId:input.orderId,digest
   },receiptKey);
   insertInbox.run(deviceId,input.eventSeq,digest,JSON.stringify(receipt),input.orderId,input.kind);
   db.exec("COMMIT");
   return {status:201,body:{receipt}};
  }catch{
   try{db.exec("ROLLBACK");}catch{}
   return {status:500,body:{error:"W07_SANDBOX_COMMIT_FAILED"}};
  }
 }
 function snapshot(){
  return {inbox:db.prepare("SELECT count(*) AS n FROM inbox").get().n,
   orders:db.prepare("SELECT count(*) AS n FROM orders").get().n,
   rows:db.prepare("SELECT id,status FROM orders ORDER BY id").all().map(row=>({id:row.id,status:row.status}))};
 }
 return {accept,snapshot,close:()=>db.close()};
}
