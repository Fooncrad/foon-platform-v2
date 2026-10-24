// Parse cloud pull queries at the HTTP boundary before database access.
// Reject ambiguous, duplicate or unexpected parameters even when a bearer
// credential is valid. Preserve optional cursor/page defaults for clients.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allowed=new Set(["tenantId","branchId","after","limit"]);
const decimal=/^(?:0|[1-9][0-9]*)$/;
export function parseSyncPullQuery(params){
 if(!(params instanceof URLSearchParams))throw Error("SYNC_INVALID_PULL_QUERY");
 const seen=new Set();
 for(const [key] of params){
  if(!allowed.has(key)||seen.has(key))throw Error("SYNC_INVALID_PULL_QUERY");
  seen.add(key);
 }
 const tenantId=params.get("tenantId");
 const branchId=params.get("branchId");
 if(!uuid.test(tenantId??"")||!uuid.test(branchId??""))throw Error("SYNC_INVALID_PULL_QUERY");
 const rawAfter=params.get("after")??"0";
 const rawLimit=params.get("limit")??"100";
 if(!decimal.test(rawAfter)||!decimal.test(rawLimit))throw Error("SYNC_INVALID_PULL_QUERY");
 const after=Number(rawAfter),limit=Number(rawLimit);
 if(!Number.isSafeInteger(after)||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error("SYNC_INVALID_PULL_QUERY");
 return {tenantId,branchId,after,limit};
}
