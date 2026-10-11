// Pure validation for an authenticated central edge sync endpoint.
// Caller must derive tenant, branch and device identity from server-side auth.
const hex=/^[a-f0-9]{64}$/;
export function validateIncomingEdgeEvent(input,identity){
 if(!identity||typeof identity.tenantId!=="string"||!identity.tenantId||typeof identity.branchId!=="string"||!identity.branchId||typeof identity.deviceId!=="string"||!identity.deviceId)return {ok:false,error:"DEVICE_UNAUTHORIZED"};
 if(!input||!Number.isSafeInteger(input.eventSeq)||input.eventSeq<1||typeof input.kind!=="string"||!["created","status"].includes(input.kind)||typeof input.orderId!=="string"||!input.orderId||typeof input.digest!=="string"||!hex.test(input.digest)||!input.payload||typeof input.payload!=="object"||Array.isArray(input.payload))return {ok:false,error:"INVALID_EDGE_EVENT"};
 if(input.tenantId!==identity.tenantId||input.branchId!==identity.branchId||input.deviceId!==identity.deviceId)return {ok:false,error:"EDGE_SCOPE_MISMATCH"};
 if(input.payload.id!==input.orderId)return {ok:false,error:"EDGE_ORDER_MISMATCH"};
 if(input.kind==="created"&&(!Array.isArray(input.payload.items)||input.payload.items.length===0))return {ok:false,error:"INVALID_EDGE_ORDER"};
 if(input.kind==="status"&&!["new","preparing","ready","completed","cancelled"].includes(input.payload.status))return {ok:false,error:"INVALID_EDGE_STATUS"};
 return {ok:true,value:{tenantId:identity.tenantId,branchId:identity.branchId,deviceId:identity.deviceId,eventSeq:input.eventSeq,kind:input.kind,orderId:input.orderId,digest:input.digest,payload:input.payload}};
}
