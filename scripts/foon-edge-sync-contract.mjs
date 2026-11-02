import {createHash,timingSafeEqual} from "node:crypto";

// Shared pure validation; the central service must issue and sign receipts.
// This module deliberately does not acknowledge local events.
export function eventDigest(event){
 if(!event||!Number.isSafeInteger(event.seq)||event.seq<1||typeof event.order_id!=="string"||!event.order_id||typeof event.kind!=="string"||!event.kind||!event.payload||typeof event.payload!=="object")throw new Error("INVALID_EDGE_EVENT");
 return createHash("sha256").update(JSON.stringify({seq:event.seq,orderId:event.order_id,kind:event.kind,payload:event.payload})).digest("hex");
}
export function validateCloudReceipt(event,receipt,expectedDeviceId){
 if(!receipt||typeof receipt!=="object"||typeof expectedDeviceId!=="string"||!expectedDeviceId)return false;
 if(receipt.deviceId!==expectedDeviceId||receipt.eventSeq!==event?.seq||receipt.orderId!==event?.order_id||typeof receipt.receiptId!=="string"||receipt.receiptId.length<8||typeof receipt.digest!=="string"||!/^[a-f0-9]{64}$/.test(receipt.digest))return false;
 const actual=Buffer.from(receipt.digest,"hex");
 const expected=Buffer.from(eventDigest(event),"hex");
 return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
