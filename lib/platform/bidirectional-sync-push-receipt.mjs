// Device-bound signed push receipt. Call signer only after the cloud journal
// transaction commits; a conflict receipt does not acknowledge the outbox.
import {createPrivateKey,createPublicKey,sign,verify} from "node:crypto";
import {validatePushReceipt} from "./bidirectional-sync-wire-contract.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const sameUuid=(a,b)=>typeof a==="string"&&typeof b==="string"&&uuid.test(a)&&uuid.test(b)&&a.toLowerCase()===b.toLowerCase();
export function pushReceiptMessage(receipt){
 if(!receipt||typeof receipt!=="object"||Array.isArray(receipt)||![receipt.deviceId,receipt.eventId,receipt.tenantId,receipt.branchId].every(value=>typeof value==="string"&&uuid.test(value))||typeof receipt.digest!=="string"||!/^[a-f0-9]{64}$/.test(receipt.digest)||!["recorded","duplicate","conflict"].includes(receipt.status)||!Number.isSafeInteger(receipt.nextVersion)||receipt.nextVersion<0)throw Error("SYNC_INVALID_RECEIPT");
 return Buffer.from("FOON-PUSH-RECEIPT-V1\n"+JSON.stringify([receipt.deviceId,receipt.eventId,receipt.tenantId,receipt.branchId,receipt.digest,receipt.status,receipt.nextVersion]),"utf8");
}
export function signCommittedPushReceipt({receipt,privateKey}){
 if(typeof privateKey!=="string")throw Error("SYNC_SIGNING_KEY_REQUIRED");
 let key;try{key=createPrivateKey(privateKey);}catch{throw Error("SYNC_SIGNING_KEY_REQUIRED");}
 if(key.asymmetricKeyType!=="ed25519")throw Error("SYNC_SIGNING_KEY_REQUIRED");
 return {ok:true,receipt:{...receipt,signature:sign(null,pushReceiptMessage(receipt),key).toString("base64url")}};
}
export function verifyCommittedPushReceipt({payload,expected,deviceId,publicKey}){
 const result=validatePushReceipt(payload,expected);
 if(!sameUuid(payload.receipt.deviceId,deviceId))throw Error("SYNC_RECEIPT_DEVICE_MISMATCH");
 const {signature}=payload.receipt;
 if(typeof signature!=="string"||!/^[A-Za-z0-9_-]{86}$/.test(signature))throw Error("SYNC_RECEIPT_SIGNATURE_REQUIRED");
 let key;try{key=createPublicKey(publicKey);}catch{throw Error("SYNC_TRUSTED_KEY_REQUIRED");}
 if(key.asymmetricKeyType!=="ed25519")throw Error("SYNC_TRUSTED_KEY_REQUIRED");
 if(!verify(null,pushReceiptMessage(payload.receipt),key,Buffer.from(signature,"base64url")))throw Error("SYNC_RECEIPT_SIGNATURE_INVALID");
 // Caller may remove a queued event only after this verified result, and
 // only for recorded or duplicate; conflicts remain pending for review.
 return {status:result.status==="conflict"?"conflict":"verified",receipt:payload.receipt};
}
