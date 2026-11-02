// Run on a trusted Node 24 host only. Do not include this file in a browser bundle.
// Configuration comes from the server environment, never from client-side inputs.
import {syncLocalOutbox} from "./foon-edge-sync-bridge.mjs";

const intervalMs=Number(process.env.FOON_EDGE_SYNC_INTERVAL_MS||5000);
if(!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>300000)throw Error("INVALID_SYNC_INTERVAL");
const config={
 localUrl:process.env.FOON_LAN_URL||"http://127.0.0.1:8787",
 localToken:process.env.FOON_LAN_TOKEN,
 ackSecret:process.env.FOON_EDGE_ACK_SECRET,
 cloudUrl:process.env.FOON_EDGE_CLOUD_SYNC_URL,
 cloudToken:process.env.FOON_EDGE_CLOUD_DEVICE_TOKEN,
 deviceId:process.env.FOON_EDGE_DEVICE_ID,
 tenantId:process.env.FOON_EDGE_TENANT_ID,
 branchId:process.env.FOON_EDGE_BRANCH_ID,
 signingSecret:process.env.FOON_EDGE_RECEIPT_SIGNING_KEY
};
let stopping=false;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
process.on("SIGINT",()=>{stopping=true;});
process.on("SIGTERM",()=>{stopping=true;});
while(!stopping){
 try{
  const result=await syncLocalOutbox(config);
  if(result.acked||result.retry)process.stdout.write(JSON.stringify({event:"edge_sync",acked:result.acked,retry:result.retry})+"\n");
 }catch(error){
  // Do not log tokens, event payloads, or personally identifying information.
  process.stderr.write(JSON.stringify({event:"edge_sync_error",code:error.message==="EDGE_SYNC_CONFIGURATION_REQUIRED"?"CONFIGURATION_REQUIRED":"SYNC_UNAVAILABLE"})+"\n");
 }
 if(!stopping)await sleep(intervalMs);
}
