// Trusted cloud handler adapter: never export this directly as an unauthenticated HTTP route.
// authenticateDevice must derive verified context from server-side enrollment and grants.
import {recordAuthorizedChange,readSignedAuthorizedChanges} from "./bidirectional-sync-service.mjs";
import {signCommittedPushReceipt} from "./bidirectional-sync-push-receipt.mjs";
import {digestChange} from "./bidirectional-sync-contract.mjs";
export async function handleAuthenticatedSyncPush({connection,authenticateDevice,credential,change,applyBusinessChange,privateKey}){
 if(typeof authenticateDevice!=="function")throw Error("SYNC_AUTHENTICATOR_REQUIRED");
 const context=await authenticateDevice(credential);
 // Authorization is checked again inside the transaction service.
 const result=await recordAuthorizedChange({db:connection,verifiedContext:context,change,applyBusinessChange});
 if(result.status!=="recorded"&&result.status!=="duplicate")return {ok:false,status:result.status,reason:result.reason};
 // This signing operation MUST follow the committed business transaction.
 return signCommittedPushReceipt({privateKey,receipt:{
  deviceId:context.deviceId,eventId:change.eventId,tenantId:context.tenantId,
  branchId:context.branchId,digest:digestChange(change),status:result.status,nextVersion:result.nextVersion
 }});
}
export async function handleAuthenticatedSyncPull({connection,authenticateDevice,credential,request,privateKey}){
 if(typeof authenticateDevice!=="function")throw Error("SYNC_AUTHENTICATOR_REQUIRED");
 const context=await authenticateDevice(credential);
 return readSignedAuthorizedChanges({db:connection,verifiedContext:context,request,privateKey});
}
