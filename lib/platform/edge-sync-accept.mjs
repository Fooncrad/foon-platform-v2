// Database-independent core for a future authenticated cloud sync route.
// The adapter must run insertInbox and applyMutation in ONE MySQL transaction.
export async function acceptEdgeEvent(event,identity,adapter){
 if(!adapter||typeof adapter.transaction!=="function")throw new Error("EDGE_TRANSACTION_REQUIRED");
 const {validateIncomingEdgeEvent}=await import("./edge-sync-validation.mjs");
 const result=validateIncomingEdgeEvent(event,identity);
 if(!result.ok)return {status:result.error==="DEVICE_UNAUTHORIZED"?401:result.error==="EDGE_SCOPE_MISMATCH"?403:400,error:result.error};
 const e=result.value;
 return adapter.transaction(async tx=>{
  // insertInbox must atomically enforce UNIQUE(device_id,event_seq).
  // A duplicate result must contain the original digest and durable receipt.
  const claim=await tx.insertInbox(e);
  if(claim.type==="duplicate"){
   if(claim.digest!==e.digest||!claim.receipt||claim.receipt.deviceId!==e.deviceId||claim.receipt.eventSeq!==e.eventSeq||claim.receipt.orderId!==e.orderId||claim.receipt.digest!==e.digest||typeof claim.receipt.receiptId!=="string"||claim.receipt.receiptId.length<8)return {status:409,error:"EDGE_IDEMPOTENCY_CONFLICT"};
   return {status:200,receipt:claim.receipt,duplicate:true};
  }
  if(claim.type!=="inserted"||!claim.receipt)throw new Error("EDGE_INBOX_CLAIM_FAILED");
  await tx.applyMutation(e);
  return {status:201,receipt:claim.receipt,duplicate:false};
 });
}
