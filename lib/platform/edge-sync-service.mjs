import {acceptEdgeEvent} from "./edge-sync-accept.mjs";
import {signCloudReceipt} from "./edge-sync-receipt-signature.mjs";

// Only call after the server authenticates and authorizes a registered device.
// The receipt is signed AFTER acceptEdgeEvent resolves, i.e. after DB commit.
export async function acceptAndSignEdgeEvent(event,identity,adapter,signingSecret){
 if(typeof signingSecret!=="string"||Buffer.byteLength(signingSecret)<32)throw Error("RECEIPT_SIGNING_KEY_REQUIRED");
 const result=await acceptEdgeEvent(event,identity,adapter);
 if(!result.receipt)return result;
 if(result.status!==200&&result.status!==201)throw Error("UNEXPECTED_EDGE_RECEIPT_STATUS");
 return {...result,receipt:signCloudReceipt(result.receipt,signingSecret)};
}
