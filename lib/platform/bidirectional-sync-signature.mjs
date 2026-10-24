// Verify signed offline pull batches using a pinned Ed25519 public key.
// Key distribution/enrollment is external; this module cannot authenticate a
// device by itself. Never accept a boolean "verified" flag from HTTP clients.
import {createPublicKey,verify} from "node:crypto";
import {validatePullBatch} from "./bidirectional-sync-wire-contract.mjs";
function encode(value){
 if(value===null||typeof value==="string"||typeof value==="boolean"||typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return "["+value.map(encode).join(",")+"]";
 if(value&&typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype)
  return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+encode(value[k])).join(",")+"}";
 throw Error("SYNC_INVALID_SIGNED_PAYLOAD");
}
export function pullBatchSignatureMessage(batch,scope){
 validatePullBatch(batch,scope);
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!uuid.test(scope.deviceId))throw Error("SYNC_INVALID_DEVICE");
 return Buffer.from("FOON-PULL-V1\n"+encode({
  // Canonicalize scope identity on both signer and verifier. Signed event bytes
  // remain unchanged, so payload digests and event tampering checks stay intact.
  deviceId:scope.deviceId.toLowerCase(),tenantId:scope.tenantId.toLowerCase(),branchId:scope.branchId.toLowerCase(),
  after:scope.after,nextCursor:batch.nextCursor,events:batch.events
 }),"utf8");
}
export function verifySignedPullBatch({batch,scope,signature,publicKey}){
 if(typeof signature!=="string"||!/^[A-Za-z0-9_-]{86}$/.test(signature))throw Error("SYNC_SIGNATURE_REQUIRED");
 if(typeof publicKey!=="string"||!publicKey.includes("BEGIN PUBLIC KEY"))throw Error("SYNC_TRUSTED_KEY_REQUIRED");
 let key;
 try {key=createPublicKey(publicKey);}catch{throw Error("SYNC_TRUSTED_KEY_REQUIRED");}
 if(key.asymmetricKeyType!=="ed25519")throw Error("SYNC_TRUSTED_KEY_REQUIRED");
 const raw=Buffer.from(signature,"base64url");
 if(raw.length!==64)throw Error("SYNC_SIGNATURE_REQUIRED");
 if(!verify(null,pullBatchSignatureMessage(batch,scope),key,raw))throw Error("SYNC_SIGNATURE_INVALID");
 return true;
}
