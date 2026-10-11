// Trusted Node-only bridge from SQLite LAN outbox to a future authenticated cloud API.
// No automatic start: configure a registered device and a deployed cloud endpoint first.
import {syncEdgeBatch} from "./foon-edge-sync-worker.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";

export async function syncLocalOutbox({localUrl,localToken,ackSecret,cloudUrl,cloudToken,deviceId,tenantId,branchId,signingSecret,fetchImpl=fetch}){
 const local=new URL(localUrl),cloud=new URL(cloudUrl);
 if(!["127.0.0.1","localhost","::1"].includes(local.hostname)||!["http:","https:"].includes(local.protocol))throw Error("INVALID_LOCAL_ENDPOINT");
 if(cloud.protocol!=="https:")throw Error("CLOUD_HTTPS_REQUIRED");
 if(cloud.username||cloud.password||cloud.hash||cloud.search||cloud.hostname==="localhost"||cloud.hostname==="127.0.0.1"||cloud.hostname==="::1")throw Error("INVALID_CLOUD_ENDPOINT");
 if([localToken,ackSecret,cloudToken,signingSecret].some(v=>typeof v!=="string"||v.length<32)||[deviceId,tenantId,branchId].some(v=>typeof v!=="string"||!v))throw Error("EDGE_SYNC_CONFIGURATION_REQUIRED");
 const headers={authorization:"Bearer "+localToken};
 const list=await fetchImpl(new URL("/outbox",local),{headers});
 if(!list.ok)throw Error("LOCAL_OUTBOX_UNAVAILABLE");
 const data=await list.json();
 if(!Array.isArray(data.events))throw Error("INVALID_LOCAL_OUTBOX");
 return syncEdgeBatch({
  events:data.events.map(e=>({...e,outboxSeq:e.seq,seq:e.event_seq})),deviceId,signingSecret,
  async send(event){
   const input={tenantId,branchId,deviceId,eventSeq:event.seq,orderId:event.order_id,kind:event.kind,payload:event.payload,digest:eventDigest(event)};
   const response=await fetchImpl(cloud,{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+cloudToken},body:JSON.stringify(input)});
   if(!response.ok)return {status:response.status};
   const body=await response.json();
   return {status:response.status,receipt:body.receipt};
  },
  async ack(event,receipt){
   const response=await fetchImpl(new URL("/outbox/ack",local),{method:"POST",headers:{...headers,"x-foon-edge-ack-secret":ackSecret,"content-type":"application/json"},body:JSON.stringify({seq:event.outboxSeq,orderId:event.order_id,receipt})});
   if(!response.ok)throw Error("LOCAL_ACK_REJECTED");
  }
 });
}
