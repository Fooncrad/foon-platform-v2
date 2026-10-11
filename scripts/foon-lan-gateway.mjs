import http from "node:http";
import {readFile,writeFile,rename,mkdir} from "node:fs/promises";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {dirname,resolve} from "node:path";

const host=process.env.FOON_LAN_HOST||"127.0.0.1";
const port=Number(process.env.FOON_LAN_PORT||8787);
const token=process.env.FOON_LAN_TOKEN;
const file=resolve(process.env.FOON_LAN_DATA||"./data/foon-lan-orders.json");
if(!token||token.length<32)throw new Error("FOON_LAN_TOKEN must be at least 32 characters");
if(!Number.isInteger(port)||port<1||port>65535)throw new Error("Invalid port");
const orders=new Map();
const clients=new Set();
try{
 const data=JSON.parse(await readFile(file,"utf8"));
 if(!Array.isArray(data))throw new Error("Invalid gateway storage");
 for(const order of data)if(order&&typeof order.id==="string")orders.set(order.id,order);
}catch(error){if(error.code!=="ENOENT")throw error;}
let queue=Promise.resolve();
function persist(){
 queue=queue.then(async()=>{
  await mkdir(dirname(file),{recursive:true});
  const tmp=file+"."+process.pid+".tmp";
  await writeFile(tmp,JSON.stringify([...orders.values()]),{mode:0o600});
  await rename(tmp,file);
 });
 return queue;
}
function send(res,status,data){res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(data));}
function announce(order){for(const client of clients){try{client.write("event: order\ndata: "+JSON.stringify(order)+"\n\n");}catch{clients.delete(client);}}}
function authorized(req){
 const given=req.headers.authorization?.replace(/^Bearer /,"")||"";
 const a=Buffer.from(given),b=Buffer.from(token);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function body(req){
 let input="";
 for await(const chunk of req){input+=chunk;if(input.length>131072)throw new Error("BODY_TOO_LARGE");}
 return JSON.parse(input||"{}");
}
const server=http.createServer(async(req,res)=>{
 res.setHeader("Access-Control-Allow-Origin","null");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(!authorized(req))return send(res,401,{error:"UNAUTHORIZED"});
 const url=new URL(req.url||"/","http://localhost");
 try{
  if(req.method==="GET"&&url.pathname==="/health")return send(res,200,{ok:true,orders:orders.size});
  if(req.method==="GET"&&url.pathname==="/orders")return send(res,200,{orders:[...orders.values()]});
  if(req.method==="GET"&&url.pathname==="/events"){
   res.writeHead(200,{"content-type":"text/event-stream","cache-control":"no-store","connection":"keep-alive"});
   res.write(": connected\n\n");clients.add(res);req.on("close",()=>clients.delete(res));return;
  }
  if(req.method==="POST"&&url.pathname==="/orders"){
   const data=await body(req);
   if(typeof data.id!=="string"||!/^[a-f0-9-]{36}$/i.test(data.id)||typeof data.branchId!=="string"||!data.branchId||!Array.isArray(data.items)||data.items.length<1||data.items.length>100)return send(res,400,{error:"INVALID_ORDER"});
   if(orders.has(data.id))return send(res,200,{ok:true,duplicate:true,order:orders.get(data.id)});
   const order={id:data.id,branchId:data.branchId,items:data.items,status:"new",createdAt:new Date().toISOString(),source:"lan"};
   orders.set(order.id,order);
   try{await persist();}catch(error){orders.delete(order.id);throw error;}
   announce(order);return send(res,201,{ok:true,order});
  }
  const match=url.pathname.match(/^\\/orders\\/([a-f0-9-]{36})\\/status$/i);
  if(req.method==="PATCH"&&match){
   const order=orders.get(match[1]);if(!order)return send(res,404,{error:"ORDER_NOT_FOUND"});
   const data=await body(req);
   if(!["new","preparing","ready","completed","cancelled"].includes(data.status))return send(res,400,{error:"INVALID_STATUS"});
   const updated={...order,status:data.status,updatedAt:new Date().toISOString()};
   orders.set(order.id,updated);
   try{await persist();}catch(error){orders.set(order.id,order);throw error;}
   announce(updated);return send(res,200,{ok:true,order:updated});
  }
  return send(res,404,{error:"NOT_FOUND"});
 }catch(error){return send(res,error.message==="BODY_TOO_LARGE"?413:500,{error:error.message==="BODY_TOO_LARGE"?"BODY_TOO_LARGE":"GATEWAY_ERROR"});}
});
server.listen(port,host,()=>process.stdout.write("FOON LAN gateway listening on "+host+":"+port+"\n"));
