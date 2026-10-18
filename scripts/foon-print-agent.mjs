import net from "node:net";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {setTimeout as delay} from "node:timers/promises";
import {isPrivatePrinterAddress} from "../lib/platform/edge-print-jobs.mjs";

const apiUrl=process.env.FOON_EDGE_PRINT_API_URL||"";
const token=process.env.FOON_EDGE_CLOUD_DEVICE_TOKEN||"";

function text(value){return String(value??"").replace(/[\u0000-\u001f\u007f]/g,"").trim();}
function line(value){return Buffer.from(text(value)+"\n","utf8");}
export function renderEscPos(job){
 const payload=job?.payload,printer=job?.printer;
 if(!payload||!printer||!Array.isArray(payload.items)||!isPrivatePrinterAddress(printer.address))throw Error("INVALID_PRINT_JOB");
 const parts=[Buffer.from([0x1b,0x40]),Buffer.from([0x1b,0x61,0x01])];
 if(printer.headerText)parts.push(line(printer.headerText));
 parts.push(line("#"+text(payload.orderNumber)),line(String(payload.channel||"order").toUpperCase()),Buffer.from([0x1b,0x61,0x00]),line("--------------------------------"));
 for(const item of payload.items){
  const quantity=Math.max(1,Math.min(999,Number(item.quantity)||1));
  const itemCopies=payload.triggerEvent==="on_paid"?1:Math.max(1,Math.min(10,Number(item.copies)||1));
  for(let copy=0;copy<itemCopies;copy++){
   parts.push(line(`${quantity} x ${item.name}`));
   if(item.options)for(const option of (Array.isArray(item.options)?item.options:[]))parts.push(line("  - "+(typeof option==="string"?option:option?.name)));
   if(Number.isFinite(Number(item.lineTotal)))parts.push(line("  "+Number(item.lineTotal).toFixed(2)+(payload.currency?" "+payload.currency:"")));
  }
 }
 if(payload.notes){for(const [key,value] of Object.entries(payload.notes))if(value)parts.push(line(key+": "+value));}
 if(payload.customer){if(payload.customer.name)parts.push(line("Customer: "+payload.customer.name));if(payload.customer.phone)parts.push(line("Phone: "+payload.customer.phone));}
 if(Number.isFinite(Number(payload.total)))parts.push(line("TOTAL: "+Number(payload.total).toFixed(2)+(payload.currency?" "+payload.currency:"")));
 if(printer.footerText)parts.push(line(printer.footerText));
 parts.push(Buffer.from([0x0a,0x0a,0x0a]));
 if(printer.cutPaper)parts.push(Buffer.from([0x1d,0x56,0x00]));
 const one=Buffer.concat(parts),copies=payload.triggerEvent==="on_paid"?Math.max(1,Math.min(10,Number(printer.copies)||1)):1;
 return Buffer.concat(Array.from({length:copies},()=>one));
}

export function sendToNetworkPrinter(job,{connect=net.createConnection,timeoutMs=8000}={}){
 const bytes=renderEscPos(job),socket=connect({host:job.printer.address,port:9100});
 return new Promise((resolve,reject)=>{
  let settled=false;const finish=(error)=>{if(settled)return;settled=true;socket.destroy();if(error)reject(error);else resolve();};
  socket.setTimeout(timeoutMs,()=>finish(Error("PRINTER_TIMEOUT")));
  socket.once("error",()=>finish(Error("PRINTER_CONNECTION_FAILED")));
  socket.once("connect",()=>socket.end(bytes,()=>finish()));
 });
}

async function api(path,init={}){
 const response=await fetch(apiUrl.replace(/\/$/,"")+path,{...init,headers:{authorization:"Bearer "+token,"content-type":"application/json",...(init.headers||{})},signal:AbortSignal.timeout(12000),redirect:"error"});
 const body=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(String(body.error||"PRINT_AGENT_HTTP_"+response.status));
 return body;
}
export async function runPrintAgentCycle({claim=()=>api(""),report=(id,result)=>api("/"+encodeURIComponent(id)+"/result",{method:"POST",body:JSON.stringify(result)}),print=job=>sendToNetworkPrinter(job),wait=delay,now=Date.now}={}){
 const response=await claim();const job=response?.job;
 if(!job)return {printed:false,idle:true};
 try{await print(job);}catch(error){
  const detail=String(error?.message||"PRINTER_CONNECTION_FAILED").slice(0,500);let reportError=null;
  try{await report(job.id,{leaseToken:job.leaseToken,outcome:"failed",error:detail});}catch(failure){reportError=String(failure?.message||"PRINT_RESULT_UNAVAILABLE");}
  return {printed:false,idle:false,jobId:String(job.id),error:detail,...(reportError?{reportError}:{})};
 }
 const leaseEnd=Date.parse(job.leaseExpiresAt),deadline=Number.isFinite(leaseEnd)?Math.max(now(),leaseEnd-10000):now()+70000;let pause=500,lastError="PRINT_RESULT_UNAVAILABLE";
 while(now()<deadline){
  try{await report(job.id,{leaseToken:job.leaseToken,outcome:"printed"});return {printed:true,idle:false,jobId:String(job.id),acknowledged:true};}
  catch(error){
   lastError=String(error?.message||lastError);
   if(["PRINT_LEASE_EXPIRED","DEVICE_UNAUTHORIZED","EDGE_FORBIDDEN","PLAN_FEATURE_REQUIRED"].includes(lastError))break;
   await wait(Math.min(pause,Math.max(1,deadline-now())));pause=Math.min(5000,pause*2);
  }
 }
 return {printed:true,idle:false,jobId:String(job.id),acknowledged:false,error:lastError};
}

async function main(){
 if(!/^https:\/\/.+\/api\/edge\/print-jobs\/?$/.test(apiUrl))throw Error("FOON_EDGE_PRINT_API_URL must be an HTTPS print-jobs URL");
 if(!/^[a-f0-9]{96}$/.test(token))throw Error("FOON_EDGE_CLOUD_DEVICE_TOKEN must be a 96-character device token");
 const controller=new AbortController();
 for(const signal of ["SIGINT","SIGTERM"])process.once(signal,()=>controller.abort());
 process.stdout.write("FOON local print agent active; department tickets and customer receipts use their configured printers.\n");
 while(!controller.signal.aborted){
  try{const result=await runPrintAgentCycle();if(result.error&&!controller.signal.aborted)process.stderr.write(`Print job ${result.jobId??"unknown"}: ${result.error}${result.reportError?"; result report failed: "+result.reportError:""}\n`);if(result.idle)await delay(2000,undefined,{signal:controller.signal});}
  catch(error){if(!controller.signal.aborted){process.stderr.write(`Print agent connection problem: ${String(error?.message||"PRINT_AGENT_UNAVAILABLE")}\n`);await delay(5000,undefined,{signal:controller.signal});}}
 }
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{process.stderr.write(String(error?.message||"PRINT_AGENT_START_FAILED")+"\n");process.exitCode=1;});
