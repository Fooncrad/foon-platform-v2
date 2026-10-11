import {validateCloudReceipt} from "./foon-edge-sync-contract.mjs";
import {verifyCloudReceiptSignature} from "../lib/platform/edge-sync-receipt-signature.mjs";

// Cloud responses are untrusted until both the event binding and HMAC pass.
// The shared key must be available only to a trusted local gateway process,
// never shipped to a browser or customer-facing client bundle.
export function verifyEdgeAck(event,receipt,deviceId,signingSecret){
 if(!verifyCloudReceiptSignature(receipt,signingSecret))return false;
 try{return validateCloudReceipt(event,receipt,deviceId);}
 catch{return false;}
}

// Sender is injected so the worker can be tested without network access.
// Store ACK only after verified signed receipt; retry on any other response.
export async function syncEdgeBatch({events,deviceId,signingSecret,send,ack}){
 if(!Array.isArray(events)||typeof send!=="function"||typeof ack!=="function")throw Error("INVALID_EDGE_SYNC_WORKER");
 const result={acked:0,retry:0,errors:[]};
 for(const event of events){
  try{
   const response=await send(event);
   if(!response||![200,201].includes(response.status)||!verifyEdgeAck(event,response.receipt,deviceId,signingSecret)){
    result.retry++;result.errors.push({seq:event.seq,error:"UNVERIFIED_CLOUD_RECEIPT"});break;
   }
   await ack(event,response.receipt);
   result.acked++;
  }catch(error){
   result.retry++;result.errors.push({seq:event?.seq,error:"EDGE_SYNC_FAILED"});break;
  }
 }
 return result;
}
