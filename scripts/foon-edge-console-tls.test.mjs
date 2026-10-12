import test from "node:test";
import assert from "node:assert/strict";
import https from "node:https";
import net from "node:net";
import {randomUUID,randomBytes} from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve,dirname} from "node:path";
import {consoleNetwork} from "./foon-edge-console-network.mjs";
import {createEdgeConsoleServer,hashOperatorPassword} from "./foon-edge-console-server.mjs";

test("LAN binding fails closed without matching HTTPS configuration",()=>{
 const insecure=spawnSync(process.execPath,["scripts/start-edge-console.mjs"],{encoding:"utf8",env:{...process.env,NODE_TLS_REJECT_UNAUTHORIZED:"0"},timeout:5000});
 assert.notEqual(insecure.status,0);assert.match(insecure.stderr,/TLS_VERIFICATION_CANNOT_BE_DISABLED/);
 const config={host:"192.168.3.148",port:8788,origin:"https://192.168.3.148:8788",certFile:"certificate.pem",keyFile:"key.pem"};
 assert.deepEqual(consoleNetwork(config),{host:config.host,port:8788,tls:true});
 for(const host of ["0.0.0.0","::","8.8.8.8","localhost.example"])
  assert.throws(()=>consoleNetwork({...config,host}),/INVALID_CONSOLE_BIND_ADDRESS/);
 assert.throws(()=>consoleNetwork({...config,certFile:undefined,keyFile:undefined}),/CONSOLE_TLS_REQUIRED_FOR_LAN/);
 assert.throws(()=>consoleNetwork({...config,keyFile:undefined}),/CONSOLE_TLS_FILES_REQUIRED/);
 assert.throws(()=>consoleNetwork({...config,origin:"http://192.168.3.148:8788"}),/CONSOLE_TLS_ORIGIN_REQUIRED/);
 assert.throws(()=>consoleNetwork({...config,origin:"https://192.168.3.149:8788"}),/CONSOLE_TLS_HOST_MISMATCH/);
 assert.throws(()=>consoleNetwork({...config,origin:"https://192.168.3.148"}),/CONSOLE_TLS_PORT_MISMATCH/);
 assert.equal(consoleNetwork({host:"127.0.0.1",port:8788,origin:"https://proxy.example"}).tls,false);
});

test("HTTPS console verifies certificates and keeps login sessions secure",async()=>{
 const tempRoot=resolve(tmpdir()),directory=await mkdtemp(join(tempRoot,"foon-console-tls-"));
 let server,child;
 try{
  const keyFile=join(directory,"key.pem"),certFile=join(directory,"certificate.pem");
  const args=["req","-x509","-newkey","rsa:2048","-nodes","-keyout",keyFile,"-out",certFile,"-days","2","-subj","/CN=127.0.0.1","-addext","subjectAltName=IP:127.0.0.1"];
  let generated=spawnSync("openssl",args,{encoding:"utf8",timeout:30000});
  if(generated.error?.code==="ENOENT"&&process.platform==="win32")generated=spawnSync(join(process.env.ProgramFiles||"C:/Program Files","Git/mingw64/bin/openssl.exe"),args,{encoding:"utf8",timeout:30000});
  assert.ifError(generated.error);assert.equal(generated.status,0,"Temporary test certificate generation failed");
  const [key,cert]=await Promise.all([readFile(keyFile),readFile(certFile)]);
  const password=randomBytes(20).toString("hex"),user={username:"tls-cashier",role:"cashier",tenantId:randomUUID(),branchId:randomUUID(),deviceId:randomUUID(),passwordHash:await hashOperatorPassword(password)};
  const origin="https://127.0.0.1:9443",base={users:[user],origin,gatewayUrl:"http://127.0.0.1:8787",gatewayToken:randomBytes(32).toString("hex"),readCatalog:()=>({identity:user,items:[],savedAt:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()})};
  assert.throws(()=>createEdgeConsoleServer({...base,origin:"http://127.0.0.1:9443",tls:{key,cert}}),/INVALID_CONSOLE_TLS_CONFIGURATION/);
  server=createEdgeConsoleServer({...base,tls:{key,cert}});
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=server.address().port;
  function request({trusted=true,servername,host="127.0.0.1:9443",requestOrigin=origin,connectPort=port}={}){
   return new Promise((resolve,reject)=>{
    const req=https.request({hostname:"127.0.0.1",port:connectPort,path:"/api/login",method:"POST",agent:false,...(trusted?{ca:cert}:{}),servername:servername??"",headers:{host,origin:requestOrigin,"content-type":"application/json"}},res=>{
     const protocol=res.socket.getProtocol();let body="";res.setEncoding("utf8");res.on("data",chunk=>body+=chunk);res.on("end",()=>resolve({status:res.statusCode,headers:res.headers,body:JSON.parse(body),protocol}));
    });req.on("error",reject);req.setTimeout(5000,()=>req.destroy(Error("TLS_TEST_TIMEOUT")));req.end(JSON.stringify({username:user.username,password}));
   });
  }
  await assert.rejects(()=>request({trusted:false}),error=>["DEPTH_ZERO_SELF_SIGNED_CERT","SELF_SIGNED_CERT_IN_CHAIN"].includes(error.code));
  await assert.rejects(()=>request({servername:"wrong.example"}),error=>error.code==="ERR_TLS_CERT_ALTNAME_INVALID");
  assert.equal((await request({requestOrigin:"https://evil.example"})).status,403);
  assert.equal((await request({host:"wrong.example:9443"})).status,421);
  const login=await request();assert.equal(login.status,200);assert.ok(["TLSv1.2","TLSv1.3"].includes(login.protocol));assert.match(login.headers["set-cookie"][0],/; Secure/);assert.match(login.headers["set-cookie"][0],/HttpOnly; SameSite=Strict/);
  assert.deepEqual(login.body.user,{username:user.username,role:"cashier"});assert.ok(!JSON.stringify(login.body).includes(user.passwordHash));
  const freePort=()=>new Promise(resolve=>{const probe=net.createServer();probe.listen(0,"127.0.0.1",()=>{const free=probe.address().port;probe.close(()=>resolve(free));});});
  const gatewayPort=await freePort(),consolePort=await freePort(),childOrigin="https://127.0.0.1:"+consolePort;
  const usersFile=join(directory,"users.json"),cacheFile=join(directory,"catalog.json");
  await writeFile(usersFile,JSON.stringify([{...user,cloudToken:randomBytes(48).toString("hex"),signingSecret:randomBytes(48).toString("hex")}]),{mode:0o600});
  await writeFile(cacheFile,JSON.stringify([{identity:{deviceId:user.deviceId,tenantId:user.tenantId,branchId:user.branchId,role:user.role},items:[],orders:[],savedAt:new Date().toISOString(),validUntil:new Date(Date.now()+3600000).toISOString()}]),{mode:0o600});
  child=spawn(process.execPath,["scripts/start-edge-console.mjs"],{env:{...process.env,FOON_EDGE_USERS_FILE:usersFile,FOON_LAN_DB:join(directory,"station.sqlite"),FOON_EDGE_CATALOG_CACHE:cacheFile,FOON_LAN_PORT:String(gatewayPort),FOON_EDGE_CONSOLE_PORT:String(consolePort),FOON_EDGE_CONSOLE_HOST:"127.0.0.1",FOON_EDGE_CONSOLE_ORIGIN:childOrigin,FOON_EDGE_CONSOLE_CERT_FILE:certFile,FOON_EDGE_CONSOLE_KEY_FILE:keyFile,FOON_LAN_TOKEN:base.gatewayToken,FOON_EDGE_ACK_SECRET:randomBytes(32).toString("hex"),FOON_EDGE_CLOUD_SYNC_URL:"https://cloud.example/api/edge/sync"},stdio:"ignore"});
  let started;for(let i=0;i<100;i++){try{started=await request({connectPort:consolePort,host:"127.0.0.1:"+consolePort,requestOrigin:childOrigin});break;}catch{if(child.exitCode!==null)break;await new Promise(resolve=>setTimeout(resolve,100));}}
  assert.equal(started?.status,200,"Standalone HTTPS console must start and preserve cached offline authorization");
  assert.match(started.headers["set-cookie"][0],/; Secure/);

 }finally{
  if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once("exit",resolve));child.kill();await exited;}
  if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  assert.equal(dirname(resolve(directory)),tempRoot);assert.ok(directory.startsWith(join(tempRoot,"foon-console-tls-")));
  await rm(directory,{recursive:true,force:true});
 }
});
