import http from "node:http";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {timingSafeEqual} from "node:crypto";
import {validateCloudReceipt} from "./foon-edge-sync-contract.mjs";
import {verifyCloudReceiptSignature} from "../lib/platform/edge-sync-receipt-signature.mjs";

const host=process.env.FOON_LAN_HOST||"127.0.0.1";
if(!["127.0.0.1","::1","localhost"].includes(host))throw new Error("LAN gateway requires a secured local reverse proxy; direct network binding is disabled");
const port=Number(process.env.FOON_LAN_PORT||8787);
const token=process.env.FOON_LAN_TOKEN||"";
if(token.length<32)throw new Error("FOON_LAN_TOKEN must be at least 32 characters");
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid port");
const file=resolve(process.env.FOON_LAN_DB||"./data/foon-lan.sqlite");
mkdirSync(dirname(file),{recursive:true});
const db=new DatabaseSync(file);
const integrityResult=db.prepare("PRAGMA quick_check").get();
if(Object.values(integrityResult)[0]!=="ok")throw Error("Database integrity verification failed");
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, branch_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_order_id ON events(order_id);
CREATE TABLE IF NOT EXISTS outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq), synced_at TEXT);`);
if(!db.prepare("PRAGMA table_info(events)").all().some(column=>column.name==="device_id"))db.exec("ALTER TABLE events ADD COLUMN device_id TEXT");
if(!db.prepare("PRAGMA table_info(outbox)").all().some(column=>column.name==="receipt_id"))db.exec("ALTER TABLE outbox ADD COLUMN receipt_id TEXT");
if(!db.prepare("PRAGMA table_info(outbox)").all().some(column=>column.name==="sync_error"))db.exec("ALTER TABLE outbox ADD COLUMN sync_error TEXT");
if(!db.prepare("PRAGMA table_info(orders)").all().some(column=>column.name==="cloud_version"))db.exec("ALTER TABLE orders ADD COLUMN cloud_version INTEGER");
const insertOrder=db.prepare("INSERT INTO orders(id,branch_id,payload,status,created_at,updated_at) VALUES(?,?,?,?,?,?)");
const getOrder=db.prepare("SELECT * FROM orders WHERE id=?");
const insertEvent=db.prepare("INSERT INTO events(order_id,kind,payload,created_at,device_id) VALUES(?,?,?,?,?)");
const insertOutbox=db.prepare("INSERT INTO outbox(event_seq) VALUES(?)");
const updateStatus=db.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?");
const clients=new Set();
const allowedStatusTransitions={new:["preparing","cancelled"],preparing:["ready","cancelled"],ready:["completed","cancelled"],completed:[],cancelled:[]};
const edgeReceiptSecret=process.env.FOON_EDGE_ACK_SECRET||"";
const cloudReceiptKey=process.env.FOON_EDGE_RECEIPT_SIGNING_KEY||"";
const edgeDeviceId=process.env.FOON_EDGE_DEVICE_ID||"";
const receiptKeys=JSON.parse(process.env.FOON_EDGE_RECEIPT_KEYS||"{}");
if(!receiptKeys||typeof receiptKeys!=="object"||Array.isArray(receiptKeys)||Object.values(receiptKeys).some(key=>typeof key!=="string"||key.length<32))throw Error("INVALID_DEVICE_RECEIPT_KEYS");
const allowedDevices=new Set([...Object.keys(receiptKeys),...(edgeDeviceId?[edgeDeviceId]:[])]);
if(edgeDeviceId)db.prepare("UPDATE events SET device_id=? WHERE device_id IS NULL").run(edgeDeviceId);
const configuredBranch=process.env.FOON_EDGE_BRANCH_ID||"";
const configuredTenant=process.env.FOON_EDGE_TENANT_ID||"";
if(configuredBranch&&db.prepare("SELECT id FROM orders WHERE branch_id<>? LIMIT 1").get(configuredBranch))throw Error("EDGE_DATABASE_BRANCH_MISMATCH");
function eventDevice(req){const id=req.headers["x-foon-edge-device-id"]||edgeDeviceId;return typeof id==="string"&&allowedDevices.has(id)?id:null;}
if(edgeReceiptSecret&&edgeReceiptSecret.length<32)throw Error("FOON_EDGE_ACK_SECRET must be at least 32 characters");
function transact(fn){db.exec("BEGIN IMMEDIATE");try{const result=fn();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}}
function send(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
function allowed(req){const given=Buffer.from((req.headers.authorization||"").replace(/^Bearer /,""));const expected=Buffer.from(token);return given.length===expected.length&&timingSafeEqual(given,expected);}
async function readBody(req,limit=131072){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>limit)throw new Error("BODY_TOO_LARGE");chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString("utf8")||"{}");}catch{throw new Error("INVALID_JSON");}}
function emit(event){for(const client of clients){try{client.write(["event: order","data: "+JSON.stringify(event),"",""].join(String.fromCharCode(10)));}catch{clients.delete(client);}}}
const server=http.createServer(async(req,res)=>{
 if(!allowed(req))return send(res,401,{error:"UNAUTHORIZED"});
 let url;
 try{url=new URL(req.url||"/","http://localhost");}catch{return send(res,400,{error:"INVALID_URL"});}
 try{
  if(req.method==="GET"&&url.pathname==="/health")return send(res,200,{ok:true,storage:"sqlite-wal-full",pending:db.prepare("SELECT count(*) AS n FROM outbox WHERE synced_at IS NULL").get().n});
  if(req.method==="GET"&&url.pathname==="/orders")return send(res,200,{orders:db.prepare("SELECT orders.*,(SELECT COUNT(*) FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE e.order_id=orders.id AND o.synced_at IS NULL) AS pending_events,(SELECT o.sync_error FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE e.order_id=orders.id AND o.synced_at IS NULL AND o.sync_error IS NOT NULL ORDER BY o.seq LIMIT 1) AS sync_error FROM orders ORDER BY created_at DESC LIMIT 500").all().map(row=>({...row,payload:JSON.parse(row.payload)}))});
  if(req.method==="POST"&&url.pathname==="/cloud/state"){
   if(!configuredBranch||!configuredTenant)return send(res,503,{error:"EDGE_SCOPE_NOT_CONFIGURED"});
   const input=await readBody(req,16*1024*1024);
   if(input.tenantId!==configuredTenant||input.branchId!==configuredBranch||!Array.isArray(input.orders)||input.orders.length>500)return send(res,400,{error:"INVALID_CLOUD_STATE"});
   for(const order of input.orders){
    if(!order||typeof order.id!=="string"||!/^[a-f0-9-]{36}$/i.test(order.id)||order.branch_id!==configuredBranch||!Object.hasOwn(allowedStatusTransitions,order.status)||!Number.isSafeInteger(order.version)||order.version<1||!Array.isArray(order.items)||order.items.length>100||!Number.isFinite(Date.parse(order.created_at))||!Number.isFinite(Date.parse(order.updated_at))||order.items.some(item=>!item||typeof item.id!=="string"||typeof item.name!=="string"||item.name.length>180||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000))return send(res,400,{error:"INVALID_CLOUD_STATE"});
   }
   let updated=0,conflicts=0;
   transact(()=>{
    for(const order of input.orders){
     const old=getOrder.get(order.id);
     if(old&&old.branch_id!==configuredBranch)throw Error("CLOUD_ORDER_BRANCH_CONFLICT");
     const pending=db.prepare("SELECT 1 FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE e.order_id=? AND o.synced_at IS NULL LIMIT 1").get(order.id);
     if(pending||old?.cloud_version>order.version)continue;
     const ranks={new:0,preparing:1,ready:2,completed:3};
     if(old&&old.status!==order.status&&(["completed","cancelled"].includes(old.status)||order.status!=="cancelled"&&ranks[order.status]<ranks[old.status])){conflicts++;continue;}
     db.prepare("INSERT INTO orders(id,branch_id,payload,status,created_at,updated_at,cloud_version) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,status=excluded.status,updated_at=excluded.updated_at,cloud_version=excluded.cloud_version").run(order.id,configuredBranch,JSON.stringify({id:order.id,branchId:configuredBranch,items:order.items}),order.status,order.created_at,order.updated_at,order.version);
     updated++;
    }
   });
   if(updated)emit({kind:"cloud_state"});return send(res,200,{ok:true,updated,conflicts});
  }
  if(req.method==="GET"&&url.pathname==="/outbox"){
   const requestedDevice=url.searchParams.get("deviceId");
   if(requestedDevice&&!allowedDevices.has(requestedDevice))return send(res,403,{error:"DEVICE_FORBIDDEN"});
   return send(res,200,{events:db.prepare("SELECT o.seq,o.event_seq,o.sync_error,e.order_id,e.kind,e.payload,e.created_at,e.device_id FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE o.synced_at IS NULL"+(requestedDevice?" AND e.device_id=?":"")+" ORDER BY o.seq LIMIT 200").all(...(requestedDevice?[requestedDevice]:[])).map(row=>({...row,payload:JSON.parse(row.payload)}))});
  }
  if(req.method==="POST"&&["/outbox/conflict","/outbox/retry"].includes(url.pathname)){
   const given=Buffer.from(req.headers["x-foon-edge-ack-secret"]||""),expected=Buffer.from(edgeReceiptSecret);
   if(!edgeReceiptSecret||given.length!==expected.length||!timingSafeEqual(given,expected))return send(res,403,{error:"OUTBOX_CONTROL_FORBIDDEN"});
   const input=await readBody(req);
   if(url.pathname==="/outbox/conflict"){
    const codes=new Set(["EDGE_CATALOG_PRICE_CHANGED","EDGE_PRICE_CONFIRMATION_REQUIRED","EDGE_REQUIRED_OPTIONS_NOT_SUPPORTED","EDGE_INVALID_STATUS_TRANSITION","EDGE_IDEMPOTENCY_CONFLICT","EDGE_CATALOG_ITEM_UNAVAILABLE","EDGE_MIXED_CURRENCY","EDGE_REFUND_REQUIRED","EDGE_ORDER_ID_CONFLICT","EDGE_REQUEST_REJECTED"]);
    if(!Number.isSafeInteger(input.seq)||input.seq<1||!codes.has(input.code))return send(res,400,{error:"INVALID_CONFLICT"});
    const pending=db.prepare("SELECT o.seq FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE o.seq=? AND e.order_id=? AND o.synced_at IS NULL").get(input.seq,input.orderId);
    if(!pending)return send(res,404,{error:"OUTBOX_EVENT_NOT_FOUND"});
    db.prepare("UPDATE outbox SET sync_error=? WHERE seq=? AND synced_at IS NULL").run(input.code,input.seq);
   }else{
    const deviceId=eventDevice(req);if(!deviceId||typeof input.orderId!=="string")return send(res,403,{error:"DEVICE_FORBIDDEN"});
    db.prepare("UPDATE outbox SET sync_error=NULL WHERE synced_at IS NULL AND event_seq IN (SELECT seq FROM events WHERE order_id=? AND device_id=?)").run(input.orderId,deviceId);
   }
   return send(res,200,{ok:true});
  }
  if(req.method==="POST"&&url.pathname==="/outbox/ack"){
   if(!edgeReceiptSecret||!allowedDevices.size)return send(res,503,{error:"ACK_NOT_CONFIGURED"});
   const provided=Buffer.from(req.headers["x-foon-edge-ack-secret"]||""),expected=Buffer.from(edgeReceiptSecret);
   if(provided.length!==expected.length||!timingSafeEqual(provided,expected))return send(res,403,{error:"ACK_FORBIDDEN"});
   const input=await readBody(req);
   if(!Number.isSafeInteger(input.seq)||input.seq<1||typeof input.orderId!=="string"||!input.orderId||!input.receipt||typeof input.receipt!=="object"||Array.isArray(input.receipt))return send(res,400,{error:"INVALID_ACK"});
   const pending=db.prepare("SELECT o.seq,e.seq AS event_seq,e.order_id,e.kind,e.payload,e.device_id,o.synced_at,o.receipt_id FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE o.seq=?").get(input.seq);
   if(!pending||pending.order_id!==input.orderId)return send(res,404,{error:"OUTBOX_EVENT_NOT_FOUND"});
   const deviceId=pending.device_id||edgeDeviceId;
   const key=receiptKeys[deviceId]??(deviceId===edgeDeviceId?cloudReceiptKey:null);
   const originalEvent={seq:Number(pending.event_seq),order_id:pending.order_id,kind:pending.kind,payload:JSON.parse(pending.payload)};
   if(!verifyCloudReceiptSignature(input.receipt,key)||!validateCloudReceipt(originalEvent,input.receipt,deviceId))return send(res,403,{error:"UNVERIFIED_CLOUD_RECEIPT"});
   if(pending.synced_at){if(pending.receipt_id&&pending.receipt_id!==input.receipt.receiptId)return send(res,409,{error:"RECEIPT_CONFLICT"});return send(res,200,{ok:true,alreadyAcknowledged:true});}
   db.prepare("UPDATE outbox SET synced_at=?,receipt_id=? WHERE seq=? AND synced_at IS NULL").run(new Date().toISOString(),input.receipt.receiptId,input.seq);
   return send(res,200,{ok:true});
  }
  if(req.method==="GET"&&url.pathname==="/events"){res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-store","connection":"keep-alive"});res.write([": connected","",""].join(String.fromCharCode(10)));clients.add(res);req.on("close",()=>clients.delete(res));return;}
  if(req.method==="POST"&&url.pathname==="/orders"){
   const input=await readBody(req);
   const deviceId=eventDevice(req);if(allowedDevices.size&&!deviceId)return send(res,403,{error:"DEVICE_FORBIDDEN"});
   if(typeof input.id!=="string"||!/^[a-f0-9-]{36}$/i.test(input.id)||typeof input.branchId!=="string"||!input.branchId||configuredBranch&&input.branchId!==configuredBranch||!Array.isArray(input.items)||input.items.length<1||input.items.length>100)return send(res,400,{error:"INVALID_ORDER"});
   if(input.items.some(item=>!item||typeof item.id!=="string"||!/^[a-f0-9-]{36}$/i.test(item.id)||!Number.isInteger(item.quantity)||item.quantity<1||item.quantity>1000))return send(res,400,{error:"INVALID_ITEMS"});
   const existing=getOrder.get(input.id);
   if(existing){const saved=JSON.parse(existing.payload);if(saved.branchId!==input.branchId||JSON.stringify(saved.items)!==JSON.stringify(input.items))return send(res,409,{error:"IDEMPOTENCY_CONFLICT"});return send(res,200,{ok:true,duplicate:true,order:existing});}
   const now=new Date().toISOString();
   const event={id:input.id,branchId:input.branchId,items:input.items,status:"new",createdAt:now};
   const result=transact(()=>{insertOrder.run(input.id,input.branchId,JSON.stringify(event),"new",now,now);const e=insertEvent.run(input.id,"created",JSON.stringify(event),now,deviceId);insertOutbox.run(e.lastInsertRowid);return event;});
   emit(result);return send(res,201,{ok:true,order:result});
  }
  const match=url.pathname.match(new RegExp("^/orders/([a-f0-9-]{36})/status$","i"));
  if(req.method==="PATCH"&&match){
   const deviceId=eventDevice(req);if(allowedDevices.size&&!deviceId)return send(res,403,{error:"DEVICE_FORBIDDEN"});
   const input=await readBody(req);
   if(!["new","preparing","ready","completed","cancelled"].includes(input.status))return send(res,400,{error:"INVALID_STATUS"});
   const old=getOrder.get(match[1]);if(!old)return send(res,404,{error:"ORDER_NOT_FOUND"});
   if(old.status===input.status)return send(res,200,{ok:true,unchanged:true});
   if(!allowedStatusTransitions[old.status]?.includes(input.status))return send(res,409,{error:"INVALID_STATUS_TRANSITION"});
   const now=new Date().toISOString(),event={id:old.id,status:input.status,updatedAt:now};
   transact(()=>{updateStatus.run(input.status,now,old.id);const e=insertEvent.run(old.id,"status",JSON.stringify(event),now,deviceId);insertOutbox.run(e.lastInsertRowid);});
   emit(event);return send(res,200,{ok:true,order:event});
  }
  return send(res,404,{error:"NOT_FOUND"});
 }catch(error){return send(res,error.message==="BODY_TOO_LARGE"?413:error.message==="INVALID_JSON"?400:500,{error:["BODY_TOO_LARGE","INVALID_JSON"].includes(error.message)?error.message:"GATEWAY_ERROR"});}
});
server.listen(port,host,()=>process.stdout.write("FOON SQLite LAN gateway on "+host+":"+port+"\\n"));
process.on("SIGTERM",()=>{server.close();db.close();});
