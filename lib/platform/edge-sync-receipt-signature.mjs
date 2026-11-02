import {createHmac,timingSafeEqual} from "node:crypto";

// Signed receipts are issued only after the central database transaction commits.
// The signing key must remain server-side and never be shared with browsers.
function validSecret(secret){return typeof secret==="string"&&Buffer.byteLength(secret)>=32;}
function canonical(receipt){
 if(!receipt||typeof receipt.receiptId!=="string"||receipt.receiptId.length<8||typeof receipt.deviceId!=="string"||!receipt.deviceId||!Number.isSafeInteger(receipt.eventSeq)||receipt.eventSeq<1||typeof receipt.orderId!=="string"||!receipt.orderId||typeof receipt.digest!=="string"||!/^[a-f0-9]{64}$/.test(receipt.digest))throw Error("INVALID_CLOUD_RECEIPT");
 return JSON.stringify([receipt.receiptId,receipt.deviceId,receipt.eventSeq,receipt.orderId,receipt.digest]);
}
export function signCloudReceipt(receipt,secret){
 if(!validSecret(secret))throw Error("RECEIPT_SIGNING_KEY_REQUIRED");
 return {...receipt,signature:createHmac("sha256",secret).update(canonical(receipt)).digest("hex")};
}
export function verifyCloudReceiptSignature(receipt,secret){
 if(!validSecret(secret)||typeof receipt?.signature!=="string"||!/^[a-f0-9]{64}$/.test(receipt.signature))return false;
 try{
  const expected=createHmac("sha256",secret).update(canonical(receipt)).digest();
  const supplied=Buffer.from(receipt.signature,"hex");
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
 }catch{return false;}
}
