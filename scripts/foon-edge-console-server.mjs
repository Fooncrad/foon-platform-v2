import http from "node:http";
import {readFile} from "node:fs/promises";
import {randomBytes,scrypt as scryptCallback,timingSafeEqual} from "node:crypto";
import {promisify} from "node:util";
const scrypt=promisify(scryptCallback);
export async function hashOperatorPassword(password,salt=randomBytes(16).toString("hex")){
 if(typeof password!=="string"||password.length<8||password.length>128)throw Error("INVALID_OPERATOR_PASSWORD");
 return "scrypt:"+salt+":"+(await scrypt(password,salt,64)).toString("hex");
}
export function createEdgeConsoleServer({users,origin,gatewayUrl,gatewayToken,ackSecret,readCatalog,syncStatus=()=>({state:"offline"}),fetchImpl=fetch}){
 const local=new URL(gatewayUrl),configuredOrigin=new URL(origin);
 if(configuredOrigin.username||configuredOrigin.password||configuredOrigin.search||configuredOrigin.hash||configuredOrigin.pathname!=="/")throw Error("INVALID_CONSOLE_ORIGIN");
 if(!["127.0.0.1","localhost","[::1]"].includes(local.hostname)||!["http:","https:"].includes(local.protocol)||local.username||local.password)throw Error("INVALID_LOCAL_ENDPOINT");
 if(!["127.0.0.1","localhost","[::1]"].includes(configuredOrigin.hostname)&&configuredOrigin.protocol!=="https:")throw Error("CONSOLE_HTTPS_REQUIRED");
 if(typeof gatewayToken!=="string"||gatewayToken.length<32||!Array.isArray(users)||!users.length||users.length>32||typeof readCatalog!=="function")throw Error("INVALID_CONSOLE_CONFIGURATION");
 for(const user of users)if(!user||!/^[a-zA-Z0-9._-]{1,64}$/.test(user.username)||!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(user.passwordHash)||!["owner","manager","cashier","kitchen"].includes(user.role)||![user.deviceId,user.branchId,user.tenantId].every(id=>typeof id==="string"&&id))throw Error("INVALID_CONSOLE_USER");
 if(new Set(users.map(user=>user.username)).size!==users.length||new Set(users.map(user=>user.deviceId)).size!==users.length||users.some(user=>user.tenantId!==users[0].tenantId||user.branchId!==users[0].branchId))throw Error("CONSOLE_SCOPE_MISMATCH");
 const sessions=new Map(),attempts=new Map();
 const reply=(res,status,body,extra={})=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; connect-src 'self'",...extra});res.end(JSON.stringify(body));};
 const csrfAllowed=(req,session)=>req.headers.origin===configuredOrigin.origin&&req.headers["x-foon-csrf"]===session.csrf;
 async function input(req){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>131072)throw Error("BODY_TOO_LARGE");chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw Error("INVALID_JSON");}}
 async function gateway(path,user,method="GET",body){return fetchImpl(new URL(path,local),{method,redirect:"error",signal:AbortSignal.timeout(10000),headers:{authorization:"Bearer "+gatewayToken,"content-type":"application/json","x-foon-edge-device-id":user.deviceId,...(path==="/outbox/retry"&&ackSecret?{"x-foon-edge-ack-secret":ackSecret}:{})},body:body?JSON.stringify(body):undefined});}
 async function grant(user){
  const catalog=await readCatalog(user);
  if(!catalog||!catalog.identity||["deviceId","tenantId","branchId","role"].some(key=>catalog.identity[key]!==user[key])||!Array.isArray(catalog.items)||!Number.isFinite(Date.parse(catalog.validUntil))||!Number.isFinite(Date.parse(catalog.savedAt))||Date.parse(catalog.validUntil)>Date.parse(catalog.savedAt)+8*60*60*1000)throw Error("LOCAL_CATALOG_UNAVAILABLE");
  return catalog;
 }
 return http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url||"/",configuredOrigin);
   if(req.headers.host!==configuredOrigin.host)return reply(res,421,{error:"INVALID_HOST"});
   if(req.method==="GET"&&["/","/console.js","/translations.js","/console.css"].includes(url.pathname)){
    const file={"/":"index.html","/console.js":"console.js","/translations.js":"translations.js","/console.css":"console.css"}[url.pathname];
    const body=await readFile(new URL("./edge-console/"+file,import.meta.url));
    res.writeHead(200,{"content-type":file.endsWith(".html")?"text/html; charset=utf-8":file.endsWith(".js")?"text/javascript; charset=utf-8":"text/css; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","content-security-policy":"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self'; connect-src 'self'"});res.end(body);return;
   }
   const now=Date.now();
   for(const [key,value] of sessions)if(value.expires<=now)sessions.delete(key);
   for(const [key,value] of attempts)if(value.expires<=now)attempts.delete(key);
   if(req.method==="POST"&&url.pathname==="/api/login"){
    if(req.headers.origin!==configuredOrigin.origin)return reply(res,403,{error:"FORBIDDEN"});
    const body=await input(req),username=typeof body.username==="string"?body.username:"",password=body.password;
    if(typeof password!=="string"||password.length<8||password.length>128)return reply(res,401,{error:"UNAUTHORIZED"});
    const key=(req.socket.remoteAddress||"unknown")+":"+username;
    if(attempts.size>=1000||attempts.get(key)?.count>=5)return reply(res,429,{error:"TOO_MANY_ATTEMPTS"});
    const attempt=attempts.get(key)||{count:0,expires:now+60000};attempt.count++;attempts.set(key,attempt);
    const user=users.find(user=>user.username===username),stored=user?.passwordHash||"scrypt:"+"0".repeat(32)+":"+"0".repeat(128),[,salt,expected]=stored.split(":");
    const supplied=await scrypt(password,salt,64);
    if(!user||!timingSafeEqual(supplied,Buffer.from(expected,"hex")))return reply(res,401,{error:"UNAUTHORIZED"});
    const catalog=await grant(user);if(Date.parse(catalog.validUntil)<=now)return reply(res,403,{error:"OFFLINE_AUTHORIZATION_EXPIRED"});
    if(sessions.size>=200)return reply(res,503,{error:"SESSION_LIMIT"});
    const token=randomBytes(32).toString("hex"),csrf=randomBytes(24).toString("hex");sessions.set(token,{user,csrf,expires:Math.min(now+8*60*60*1000,Date.parse(catalog.validUntil))});attempts.delete(key);
    return reply(res,200,{ok:true,csrf,user:{username:user.username,role:user.role}},{"set-cookie":"foon_local_session="+token+"; HttpOnly; SameSite=Strict; Path=/"+(configuredOrigin.protocol==="https:"?"; Secure":"")});
   }
   const token=(req.headers.cookie||"").match(/(?:^|;\s*)foon_local_session=([a-f0-9]{64})(?:;|$)/)?.[1],session=sessions.get(token);
   if(!session)return reply(res,401,{error:"UNAUTHORIZED"});
   const user=session.user;
   if(req.method==="GET"&&url.pathname==="/api/state"){
    const catalog=await grant(user),[ordersResponse,healthResponse]=await Promise.all([gateway("/orders",user),gateway("/health",user)]);
    if(!ordersResponse.ok||!healthResponse.ok)throw Error("LOCAL_GATEWAY_UNAVAILABLE");
    const {orders}=await ordersResponse.json(),health=await healthResponse.json();
    return reply(res,200,{ok:true,csrf:session.csrf,user:{username:user.username,role:user.role},menu:catalog.items,savedAt:catalog.savedAt,validUntil:catalog.validUntil,orders:orders.filter(order=>order.branch_id===user.branchId).map(order=>({id:order.id,status:order.status,createdAt:order.created_at,items:order.payload.items,pending:order.pending_events,error:order.sync_error})),pending:health.pending,sync:syncStatus(user)});
   }
   if(!csrfAllowed(req,session))return reply(res,403,{error:"FORBIDDEN"});
   if(req.method==="POST"&&url.pathname==="/api/logout"){sessions.delete(token);return reply(res,200,{ok:true},{"set-cookie":"foon_local_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"+(configuredOrigin.protocol==="https:"?"; Secure":"")});}
   const catalog=await grant(user);if(Date.parse(catalog.validUntil)<=now)return reply(res,403,{error:"OFFLINE_AUTHORIZATION_EXPIRED"});
   const retry=url.pathname.match(/^\/api\/orders\/([a-f0-9-]{36})\/retry$/i);
   if(req.method==="POST"&&retry){
    if(!ackSecret)return reply(res,503,{error:"RETRY_NOT_CONFIGURED"});
    const existing=await gateway("/orders",user);if(!existing.ok)throw Error("LOCAL_GATEWAY_UNAVAILABLE");
    if(!(await existing.json()).orders.some(order=>order.id===retry[1]&&order.branch_id===user.branchId))return reply(res,404,{error:"ORDER_NOT_FOUND"});
    // Only this operator's device queue is released; payload and sequence stay immutable.
    const result=await gateway("/outbox/retry",user,"POST",{orderId:retry[1]});return reply(res,result.status,await result.json());
   }
   if(req.method==="POST"&&url.pathname==="/api/orders"){
    if(user.role==="kitchen")return reply(res,403,{error:"FORBIDDEN"});
    const body=await input(req);
    if(!body||Object.keys(body).some(key=>!["id","items"].includes(key))||!Array.isArray(body.items)||!body.items.length||body.items.length>100||new Set(body.items.map(item=>item?.id)).size!==body.items.length||body.items.some(item=>!item||Object.keys(item).some(key=>!["id","quantity"].includes(key))||!catalog.items.some(product=>product.id===item.id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000))return reply(res,400,{error:"INVALID_ORDER"});
    const chosen=body.items.map(item=>catalog.items.find(product=>product.id===item.id));
    if(new Set(chosen.map(item=>item.currency)).size!==1||chosen.some(item=>!/^\d{1,10}(\.\d{1,2})?$/.test(String(item.price))))return reply(res,400,{error:"INVALID_ORDER"});
    const items=body.items.map((item,index)=>({...item,expectedUnitCents:Math.round(Number(chosen[index].price)*100),expectedCurrency:chosen[index].currency}));
    const result=await gateway("/orders",user,"POST",{id:body.id,branchId:user.branchId,items});return reply(res,result.status,await result.json());
   }
   const match=url.pathname.match(/^\/api\/orders\/([a-f0-9-]{36})\/status$/i);
   if(req.method==="PATCH"&&match){
    const body=await input(req);
    if(!body||Object.keys(body).some(key=>key!=="status")||user.role==="kitchen"&&!["preparing","ready"].includes(body.status))return reply(res,403,{error:"FORBIDDEN"});
    const existing=await gateway("/orders",user);if(!existing.ok)throw Error("LOCAL_GATEWAY_UNAVAILABLE");
    if(!(await existing.json()).orders.some(order=>order.id===match[1]&&order.branch_id===user.branchId))return reply(res,404,{error:"ORDER_NOT_FOUND"});
    const result=await gateway("/orders/"+match[1]+"/status",user,"PATCH",body);return reply(res,result.status,await result.json());
   }
   return reply(res,404,{error:"NOT_FOUND"});
  }catch(error){return reply(res,error.message==="BODY_TOO_LARGE"?413:error.message==="INVALID_JSON"?400:503,{error:["BODY_TOO_LARGE","INVALID_JSON","OFFLINE_AUTHORIZATION_EXPIRED"].includes(error.message)?error.message:"LOCAL_SERVICE_UNAVAILABLE"});}
 });
}
