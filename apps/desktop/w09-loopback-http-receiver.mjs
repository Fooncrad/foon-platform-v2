// W09 TEST ONLY. Real HTTP over 127.0.0.1 backed by a disposable
// W07 SQLite receiver. Never listen on LAN or contact a production service.
// No credential or network port is supplied by application configuration.
import http from "node:http";
import {timingSafeEqual} from "node:crypto";
import {createSandboxReceiver} from "./w07-sandbox-receiver.mjs";

function respond(res,status,data){
  res.writeHead(status,{"content-type":"application/json; charset=utf-8",
    "cache-control":"no-store","x-content-type-options":"nosniff"});
  res.end(JSON.stringify(data));
}
async function bodyOf(req){
  let length=0;
  const chunks=[];
  for await(const chunk of req){
    length+=chunk.length;
    if(length>131072)throw Error("W09_BODY_TOO_LARGE");
    chunks.push(chunk);
  }
  try{
    const value=JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if(!value||typeof value!=="object"||Array.isArray(value))throw Error();
    return value;
  }catch{throw Error("W09_INVALID_JSON");}
}

export async function startW09LoopbackReceiver({port=0,dbPath,deviceId,tenantId,branchId,authToken,receiptKey}){
  if(!Number.isSafeInteger(port)||port<0||port>65535)throw Error("W09_INVALID_TEST_PORT");
  const receiver=createSandboxReceiver({dbPath,deviceId,tenantId,branchId,authToken,receiptKey});
  let tamperReceipts=false,loseResponse=false,closed=false;
  const server=http.createServer({requestTimeout:8000,headersTimeout:5000},async(req,res)=>{
    const path=(req.url||"").split("?")[0];
    const token=/^Bearer (.+)$/.exec(req.headers.authorization||"")?.[1]||"";
    if(path!=="/edge/sync"&&path!=="/test/state")
      return respond(res,404,{error:"W09_NOT_FOUND"});
    const supplied=Buffer.from(token),expected=Buffer.from(authToken);
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))
      return respond(res,401,{error:"W09_UNAUTHORIZED"});
    if(req.method==="GET"&&path==="/test/state")
      return respond(res,200,receiver.snapshot());
    if(req.method!=="POST"||path!=="/edge/sync")
      return respond(res,405,{error:"W09_METHOD_FORBIDDEN"});
    if(!/^application\/json(?:;|$)/i.test(req.headers["content-type"]||""))
      return respond(res,415,{error:"W09_JSON_REQUIRED"});
    try{
      const event=await bodyOf(req);
      const result=receiver.accept(event,token);
      // Commit is durable BEFORE breaking the network response.
      if(loseResponse&&[200,201].includes(result.status)){
        loseResponse=false;
        res.destroy();
        return;
      }
      const output={...result.body};
      if(tamperReceipts&&output.receipt){
        output.receipt={...output.receipt,signature:"0".repeat(64)};
      }
      return respond(res,result.status,output);
    }catch(error){
      return respond(res,error?.message==="W09_BODY_TOO_LARGE"?413:400,
        {error:error?.message==="W09_BODY_TOO_LARGE"?"W09_BODY_TOO_LARGE":"W09_INVALID_JSON"});
    }
  });
  try{
    await new Promise((resolve,reject)=>{
      server.once("error",reject);
      server.listen(port,"127.0.0.1",resolve);
    });
  }catch(error){
    receiver.close();
    throw error;
  }
  return {
    port:server.address().port,
    url:"http://127.0.0.1:"+server.address().port,
    snapshot:()=>receiver.snapshot(),
    tamperReceipts:value=>{tamperReceipts=Boolean(value);},
    loseNextResponse:()=>{loseResponse=true;},
    async stop(){
      if(closed)return;
      closed=true;
      await new Promise((resolve,reject)=>{
        server.close(error=>error?reject(error):resolve());
        server.closeAllConnections();
      });
      receiver.close();
    }
  };
}
