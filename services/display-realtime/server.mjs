import {createServer} from "node:http";
import {createHmac,timingSafeEqual} from "node:crypto";
import {WebSocketServer} from "ws";
import {pathToFileURL} from "node:url";

const port=Number(process.env.PORT||8789);
const secret=process.env.FOON_DISPLAY_REALTIME_SECRET||"";
const allowedOrigins=new Set((process.env.FOON_DISPLAY_ALLOWED_ORIGINS||"").split(",").map(v=>v.trim()).filter(Boolean));
if(secret.length<32)throw new Error("FOON_DISPLAY_REALTIME_SECRET must contain at least 32 characters");
if(!allowedOrigins.size)throw new Error("FOON_DISPLAY_ALLOWED_ORIGINS must list trusted FOON origins");

export function verifyTicket(ticket,now=Math.floor(Date.now()/1000)){
 if(typeof ticket!=="string"||ticket.length>2048)return null;
 const [payload,signature,...extra]=ticket.split(".");
 if(extra.length||!payload||!signature)return null;
 const expected=createHmac("sha256",secret).update(payload).digest();
 let actual;try{actual=Buffer.from(signature,"base64url");}catch{return null;}
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
 try{
  const data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
  if(data.v!==1||typeof data.sub!=="string"||typeof data.tenant!=="string"||typeof data.nonce!=="string"||!Number.isInteger(data.exp)||data.exp<=now||data.exp>now+120)return null;
  return {screenId:data.sub,tenantId:data.tenant,nonce:data.nonce,expiresAt:data.exp};
 }catch{return null;}
}
function authorized(req){
 const value=req.headers.authorization||"";
 const supplied=Buffer.from(value.startsWith("Bearer ")?value.slice(7):"");
 const expected=Buffer.from(secret);
 return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
export const server=createServer((req,res)=>{
 if(req.method==="GET"&&req.url==="/health"){res.writeHead(200,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({ok:true,service:"foon-display-realtime"}));return;}
 if(req.method!=="POST"||req.url!=="/publish"){res.writeHead(404);res.end();return;}
 if(!authorized(req)){res.writeHead(401,{"cache-control":"no-store"});res.end();return;}
 let body="";req.on("data",chunk=>{body+=chunk;if(body.length>8192){req.destroy();}});
 req.on("end",()=>{
  let event;try{event=JSON.parse(body);}catch{res.writeHead(400);res.end();return;}
  if(event?.type!=="display.invalidate"||typeof event.screenId!=="string"||typeof event.tenantId!=="string"||event.screenId.length>64||event.tenantId.length>64){res.writeHead(400);res.end();return;}
  const message=JSON.stringify({type:"display.invalidate",screenId:event.screenId});
  let delivered=0;
  for(const client of wss.clients){if(client.readyState===1&&client.screenId===event.screenId&&client.tenantId===event.tenantId){client.send(message);delivered++;}}
  res.writeHead(202,{"content-type":"application/json","cache-control":"no-store"});res.end(JSON.stringify({ok:true,delivered}));
 });
});
export const wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
const consumedTickets=new Map();
export function consumeTicket(ticket,now=Math.floor(Date.now()/1000)){
 for(const [nonce,expiresAt] of consumedTickets){if(expiresAt<=now)consumedTickets.delete(nonce);}
 const identity=verifyTicket(ticket,now);
 if(!identity||consumedTickets.has(identity.nonce))return null;
 consumedTickets.set(identity.nonce,identity.expiresAt);
 return identity;
}
server.on("upgrade",(req,socket,head)=>{
 let url;try{url=new URL(req.url||"/","http://localhost");}catch{socket.destroy();return;}
 const origin=req.headers.origin||"";
 const identity=url.pathname==="/ws"&&allowedOrigins.has(origin)?consumeTicket(url.searchParams.get("ticket")):null;
 if(!identity){socket.write("HTTP/1.1 401 Unauthorized\\r\\nConnection: close\\r\\n\\r\\n");socket.destroy();return;}
 wss.handleUpgrade(req,socket,head,ws=>{ws.screenId=identity.screenId;ws.tenantId=identity.tenantId;wss.emit("connection",ws,req);});
});
wss.on("connection",ws=>{ws.on("error",()=>{});});
export function start(){
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(ws.readyState===1)ws.ping();}},25000);
 server.listen(port,"0.0.0.0");
 for(const signal of ["SIGINT","SIGTERM"])process.on(signal,()=>{clearInterval(heartbeat);wss.close();server.close(()=>process.exit(0));});
 return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)start();
