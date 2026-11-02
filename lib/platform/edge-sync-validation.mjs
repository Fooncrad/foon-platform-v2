// Pure validation for an authenticated central edge sync endpoint.
// Caller must derive tenant, branch and device identity from server-side auth.
import {createHash,timingSafeEqual} from "node:crypto";
const hex=/^[a-f0-9]{64}$/;
export function validateIncomingEdgeEvent(input,identity){
 if(!identity||typeof identity.tenantId!=="string"||!identity.tenantId||typeof identity.branchId!=="string"||!identity.branchId||typeof identity.deviceId!=="string"||!identity.deviceId)return {ok:false,error:"DEVICE_UNAUTHORIZED"};
 if(!input||!Number.isSafeInteger(input.eventSeq)||input.eventSeq<1||typeof input.kind!=="string"||!["created","status"].includes(input.kind)||typeof input.orderId!=="string"||!input.orderId||typeof input.digest!=="string"||!hex.test(input.digest)||!input.payload||typeof input.payload!=="object"||Array.isArray(input.payload))return {ok:false,error:"INVALID_EDGE_EVENT"};
 const calculated=createHash("sha256").update(JSON.stringify({seq:input.eventSeq,orderId:input.orderId,kind:input.kind,payload:input.payload})).digest("hex");
 if(!timingSafeEqual(Buffer.from(input.digest,"hex"),Buffer.from(calculated,"hex")))return {ok:false,error:"EDGE_DIGEST_MISMATCH"};
 if(input.tenantId!==identity.tenantId||input.branchId!==identity.branchId||input.deviceId!==identity.deviceId)return {ok:false,error:"EDGE_SCOPE_MISMATCH"};
 if(input.payload.branchId!==undefined&&input.payload.branchId!==identity.branchId)return {ok:false,error:"EDGE_PAYLOAD_SCOPE_MISMATCH"};
 if(input.payload.tenantId!==undefined&&input.payload.tenantId!==identity.tenantId)return {ok:false,error:"EDGE_PAYLOAD_SCOPE_MISMATCH"};
 if(input.payload.id!==input.orderId)return {ok:false,error:"EDGE_ORDER_MISMATCH"};
 if(input.kind==="created"){
  const items=input.payload.items;
  if(!Array.isArray(items)||items.length===0||items.length>100||typeof input.orderId!=="string"||!/^[a-f0-9-]{36}$/i.test(input.orderId))return {ok:false,error:"INVALID_EDGE_ORDER"};
  const ids=new Set();
  for(const item of items){
   if(!item||typeof item.id!=="string"||!/^[a-f0-9-]{36}$/i.test(item.id)||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1000||ids.has(item.id))return {ok:false,error:"INVALID_EDGE_ORDER_ITEMS"};
   ids.add(item.id);
  }
 }
 if(input.kind==="status"&&(Object.keys(input.payload).some(key=>!["id","branchId","status","updatedAt"].includes(key))||!["new","preparing","ready","completed","cancelled"].includes(input.payload.status)))return {ok:false,error:"INVALID_EDGE_STATUS"};
 return {ok:true,value:{tenantId:identity.tenantId,branchId:identity.branchId,deviceId:identity.deviceId,eventSeq:input.eventSeq,kind:input.kind,orderId:input.orderId,digest:input.digest,payload:input.payload}};
}
