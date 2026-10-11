// Trusted Node-only bridge from SQLite LAN outbox to a future authenticated cloud API.
// No automatic start: configure a registered device and a deployed cloud endpoint first.
import {syncEdgeBatch} from "./foon-edge-sync-worker.mjs";
import {eventDigest} from "./foon-edge-sync-contract.mjs";
import {BlockList,isIP} from "node:net";

// Literal cloud addresses must not point at local, private or reserved networks.
// DNS names still require trusted configuration and network-level egress controls.
const blockedCloudAddresses=new BlockList();
for(const [address,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]])blockedCloudAddresses.addSubnet(address,prefix,"ipv4");
for(const [address,prefix] of [["::",96],["fc00::",7],["fe80::",10],["ff00::",8],["2001:db8::",32]])blockedCloudAddresses.addSubnet(address,prefix,"ipv6");
function invalidCloudHost(hostname){
 const host=hostname.replace(/^\[|\]$/g,"").replace(/\.$/,"");
 const family=isIP(host);
 if(family)return blockedCloudAddresses.check(host,family===4?"ipv4":"ipv6");
 return host==="localhost"||host.endsWith(".localhost")||host.endsWith(".local")||host.endsWith(".internal");
}

export async function syncLocalOutbox({localUrl,localToken,ackSecret,cloudUrl,cloudToken,deviceId,tenantId,branchId,signingSecret,fetchImpl=fetch}){
 const local=new URL(localUrl),cloud=new URL(cloudUrl);
 if(!["127.0.0.1","localhost","[::1]"].includes(local.hostname)||!["http:","https:"].includes(local.protocol))throw Error("INVALID_LOCAL_ENDPOINT");
 if(cloud.protocol!=="https:")throw Error("CLOUD_HTTPS_REQUIRED");
 if(cloud.username||cloud.password||cloud.hash||cloud.search||invalidCloudHost(cloud.hostname))throw Error("INVALID_CLOUD_ENDPOINT");
 if(!["443",""].includes(cloud.port))throw Error("INVALID_CLOUD_ENDPOINT");
 if([localToken,ackSecret,cloudToken,signingSecret].some(v=>typeof v!=="string"||v.length<32)||[deviceId,tenantId,branchId].some(v=>typeof v!=="string"||!v))throw Error("EDGE_SYNC_CONFIGURATION_REQUIRED");
 const headers={authorization:"Bearer "+localToken};
 const list=await fetchImpl(new URL("/outbox",local),{headers,redirect:"error"});
 if(!list.ok)throw Error("LOCAL_OUTBOX_UNAVAILABLE");
 const data=await list.json();
 if(!Array.isArray(data.events)||data.events.length>1000)throw Error("INVALID_LOCAL_OUTBOX");
 for(const e of data.events){
  if(!e||!Number.isSafeInteger(e.seq)||e.seq<1||!Number.isSafeInteger(e.event_seq)||e.event_seq<1||typeof e.order_id!=="string"||!e.order_id||!["created","status"].includes(e.kind)||!e.payload||typeof e.payload!=="object"||Array.isArray(e.payload))throw Error("INVALID_LOCAL_OUTBOX");
 }
 return syncEdgeBatch({
  events:data.events.map(e=>({...e,outboxSeq:e.seq,seq:e.event_seq})),deviceId,signingSecret,
  async send(event){
   const input={tenantId,branchId,deviceId,eventSeq:event.seq,orderId:event.order_id,kind:event.kind,payload:event.payload,digest:eventDigest(event)};
   const response=await fetchImpl(cloud,{method:"POST",redirect:"error",headers:{"content-type":"application/json",authorization:"Bearer "+cloudToken},body:JSON.stringify(input)});
   if(!response.ok)return {status:response.status};
   const body=await response.json();
   return {status:response.status,receipt:body.receipt};
  },
  async ack(event,receipt){
   const response=await fetchImpl(new URL("/outbox/ack",local),{method:"POST",redirect:"error",headers:{...headers,"x-foon-edge-ack-secret":ackSecret,"content-type":"application/json"},body:JSON.stringify({seq:event.outboxSeq,orderId:event.order_id,receipt})});
   if(!response.ok)throw Error("LOCAL_ACK_REJECTED");
  }
 });
}
