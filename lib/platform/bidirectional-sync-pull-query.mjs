// Parse the isolated sync pull query without JavaScript number coercion.
// A device cursor and its tenant/branch scope must be explicit and unambiguous.
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const decimal=/^(0|[1-9][0-9]*)$/;
export function parseScopedSyncPullQuery(url){
 let params;
 try{params=new URL(url).searchParams;}catch{throw Error("SYNC_INVALID_QUERY");}
 const keys=["tenantId","branchId","after","limit"];
 if(params.size!==keys.length||keys.some(key=>params.getAll(key).length!==1))throw Error("SYNC_INVALID_QUERY");
 const tenantId=params.get("tenantId"),branchId=params.get("branchId");
 const rawAfter=params.get("after"),rawLimit=params.get("limit");
 if(!uuid.test(tenantId)||!uuid.test(branchId)||!decimal.test(rawAfter)||!decimal.test(rawLimit))throw Error("SYNC_INVALID_QUERY");
 const after=Number(rawAfter),limit=Number(rawLimit);
 if(!Number.isSafeInteger(after)||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error("SYNC_INVALID_QUERY");
 return {tenantId,branchId,after,limit};
}
