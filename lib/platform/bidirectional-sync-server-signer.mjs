// Server-side pull signer. Only call after authenticated device authorization and
// per-entity read-grant filtering. Never expose the private key to Windows or HTTP.
import {createPrivateKey,sign} from "node:crypto";
import {pullBatchSignatureMessage} from "./bidirectional-sync-signature.mjs";
export function signAuthorizedPullBatch({batch,scope,privateKey}){
 if(typeof privateKey!=="string"||!privateKey.includes("BEGIN PRIVATE KEY"))throw Error("SYNC_SIGNING_KEY_REQUIRED");
 let key;
 try{key=createPrivateKey(privateKey);}catch{throw Error("SYNC_SIGNING_KEY_REQUIRED");}
 if(key.asymmetricKeyType!=="ed25519")throw Error("SYNC_SIGNING_KEY_REQUIRED");
 return {
  ...batch,
  signature:sign(null,pullBatchSignatureMessage(batch,scope),key).toString("base64url")
 };
}
