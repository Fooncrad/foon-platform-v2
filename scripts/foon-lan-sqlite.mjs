import http from "node:http";
import {DatabaseSync} from "node:sqlite";
import {mkdirSync} from "node:fs";
import {dirname,resolve} from "node:path";
import {timingSafeEqual} from "node:crypto";

const host=process.env.FOON_LAN_HOST||"127.0.0.1";
const port=Number(process.env.FOON_LAN_PORT||8787);
const token=process.env.FOON_LAN_TOKEN||"";
if(token.length<32)throw new Error("FOON_LAN_TOKEN must be at least 32 characters");
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid port");
const file=resolve(process.env.FOON_LAN_DB||"./data/foon-lan.sqlite");
mkdirSync(dirname(file),{recursive:true});
const db=new DatabaseSync(file);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY, branch_id TEXT NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS events_order_id ON events(order_id);
CREATE TABLE IF NOT EXISTS outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT, event_seq INTEGER NOT NULL UNIQUE REFERENCES events(seq), synced_at TEXT);`);
const insertOrder=db.prepare("INSERT INTO orders(id,branch_id,payload,status,created_at,updated_at) VALUES(?,?,?,?,?,?)");
const getOrder=db.prepare("SELECT * FROM orders WHERE id=?");
const insertEvent=db.prepare("INSERT INTO events(order_id,kind,payload,created_at) VALUES(?,?,?,?)");
const insertOutbox=db.prepare("INSERT INTO outbox(event_seq) VALUES(?)");
const updateStatus=db.prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?");
const clients=new Set();
function transact(fn){db.exec("BEGIN IMMEDIATE");try{const result=fn();db.exec("COMMIT");return result;}catch(e){db.exec("ROLLBACK");throw e;}}
function send(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff"});res.end(JSON.stringify(data));}
function allowed(req){const given=Buffer.from((req.headers.authorization||"").replace(/^Bearer /,""));const expected=Buffer.from(token);return given.length===expected.length&&timingSafeEqual(given,expected);}
async function readBody(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>131072)throw new Error("BODY_TOO_LARGE");}try{return JSON.parse(raw||"{}");}catch{throw new Error("INVALID_JSON");}}
function emit(event){for(const client of clients){try{client.write(["event: order","data: "+JSON.stringify(event),"",""].join(String.fromCharCode(10)));}catch{clients.delete(client);}}}
const server=http.createServer(async(req,res)=>{
 if(!allowed(req))return send(res,401,{error:"UNAUTHORIZED"});
 const url=new URL(req.url||"/","http://localhost");
 try{
  if(req.method==="GET"&&url.pathname==="/health")return send(res,200,{ok:true,storage:"sqlite-wal-full",pending:db.prepare("SELECT count(*) AS n FROM outbox WHERE synced_at IS NULL").get().n});
  if(req.method==="GET"&&url.pathname==="/orders")return send(res,200,{orders:db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT 500").all().map(row=>({...row,payload:JSON.parse(row.payload)}))});
  if(req.method==="GET"&&url.pathname==="/outbox")return send(res,200,{events:db.prepare("SELECT o.seq,e.order_id,e.kind,e.payload,e.created_at FROM outbox o JOIN events e ON e.seq=o.event_seq WHERE o.synced_at IS NULL ORDER BY o.seq LIMIT 200").all().map(row=>({...row,payload:JSON.parse(row.payload)}))});
  if(req.method==="GET"&&url.pathname==="/events"){res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-store","connection":"keep-alive"});res.write([": connected","",""].join(String.fromCharCode(10)));clients.add(res);req.on("close",()=>clients.delete(res));return;}
  if(req.method==="POST"&&url.pathname==="/orders"){
   const input=await readBody(req);
   if(typeof input.id!=="string"||!/^[a-f0-9-]{36}$/i.test(input.id)||typeof input.branchId!=="string"||!input.branchId||!Array.isArray(input.items)||input.items.length<1||input.items.length>100)return send(res,400,{error:"INVALID_ORDER"});
   const existing=getOrder.get(input.id);
   if(existing)return send(res,200,{ok:true,duplicate:true,order:existing});
   const now=new Date().toISOString();
   const event={id:input.id,branchId:input.branchId,items:input.items,status:"new",createdAt:now};
   const result=transact(()=>{insertOrder.run(input.id,input.branchId,JSON.stringify(event),"new",now,now);const e=insertEvent.run(input.id,"created",JSON.stringify(event),now);insertOutbox.run(e.lastInsertRowid);return event;});
   emit(result);return send(res,201,{ok:true,order:result});
  }
  const match=url.pathname.match(new RegExp("^/orders/([a-f0-9-]{36})/status$","i"));
  if(req.method==="PATCH"&&match){
   const input=await readBody(req);
   if(!["new","preparing","ready","completed","cancelled"].includes(input.status))return send(res,400,{error:"INVALID_STATUS"});
   const old=getOrder.get(match[1]);if(!old)return send(res,404,{error:"ORDER_NOT_FOUND"});
   if(old.status===input.status)return send(res,200,{ok:true,unchanged:true});
   const now=new Date().toISOString(),event={id:old.id,status:input.status,updatedAt:now};
   transact(()=>{updateStatus.run(input.status,now,old.id);const e=insertEvent.run(old.id,"status",JSON.stringify(event),now);insertOutbox.run(e.lastInsertRowid);});
   emit(event);return send(res,200,{ok:true,order:event});
  }
  return send(res,404,{error:"NOT_FOUND"});
 }catch(error){return send(res,error.message==="BODY_TOO_LARGE"?413:error.message==="INVALID_JSON"?400:500,{error:["BODY_TOO_LARGE","INVALID_JSON"].includes(error.message)?error.message:"GATEWAY_ERROR"});}
});
server.listen(port,host,()=>process.stdout.write("FOON SQLite LAN gateway on "+host+":"+port+"\\n"));
process.on("SIGTERM",()=>{server.close();db.close();});
