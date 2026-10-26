import {isIP} from "node:net";
// Safe transport for *future* FOON two-way sync. No worker auto-start.
// Reject login/preview redirects and HTML with no automatic retry-as-success.
export function validateSyncApiResponse(response){
 if(!response||typeof response.status!=="number"||!response.headers)throw Error("SYNC_INVALID_RESPONSE");
 if(response.redirected||response.status>=300&&response.status<400)throw Error("SYNC_REDIRECT_BLOCKED");
 // Preserve actionable auth/offline HTTP errors even when a proxy returns HTML.
 if(response.status===401||response.status===403)throw Error("SYNC_AUTH_REJECTED");
 if(!response.ok)throw Error("SYNC_HTTP_"+response.status);
 const type=String(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
 if(type!=="application/json"&&!(type.startsWith("application/")&&type.endsWith("+json")))throw Error("SYNC_NON_JSON_RESPONSE");
 return response;
}
export async function requestSyncJson({url,method="GET",body,authorization,fetchImpl=fetch,timeoutSignal,pullQuery}){
 const target=new URL(url);
 if(target.protocol!=="https:"||target.username||target.password||target.hash||target.port&&target.port!=="443"||target.hostname.endsWith(".")||(!target.hostname.includes(".")||isIP(target.hostname)||/(?:^|\.)(?:localhost|local|internal)$/.test(target.hostname)))throw Error("SYNC_UNSAFE_ENDPOINT");
 if(!/^\/api\/sync\/v1\/(push|pull)$/.test(target.pathname))throw Error("SYNC_UNEXPECTED_ENDPOINT");
 if(target.search){
  const required=["tenantId","branchId","after","limit"];
  if(method!=="GET"||target.pathname!=="/api/sync/v1/pull"||!pullQuery||typeof pullQuery!=="object"||Array.isArray(pullQuery)||target.searchParams.size!==required.length||Object.keys(pullQuery).length!==required.length||required.some(key=>!Object.hasOwn(pullQuery,key)||target.searchParams.getAll(key).length!==1||target.searchParams.get(key)!==String(pullQuery[key])))throw Error("SYNC_UNSAFE_QUERY");
  // Reject malformed scope and cursor values before transmitting device credentials.
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(typeof pullQuery.tenantId!=="string"||!uuid.test(pullQuery.tenantId)||typeof pullQuery.branchId!=="string"||!uuid.test(pullQuery.branchId)||!Number.isSafeInteger(pullQuery.after)||pullQuery.after<0||!Number.isSafeInteger(pullQuery.limit)||pullQuery.limit<1||pullQuery.limit>200)throw Error("SYNC_UNSAFE_QUERY");
 }else if(pullQuery||method==="GET"&&target.pathname==="/api/sync/v1/pull")throw Error("SYNC_UNSAFE_QUERY");
 // Bind the HTTP method to its endpoint before any bearer token is sent.
 // A push must be POST with a body; a pull must be GET without a body.
 if(method!=="GET"&&method!=="POST")throw Error("SYNC_INVALID_METHOD");
 if((method==="GET"&&target.pathname!=="/api/sync/v1/pull")||(method==="POST"&&target.pathname!=="/api/sync/v1/push"))throw Error("SYNC_METHOD_ENDPOINT_MISMATCH");
 if(method==="GET"&&body!==undefined||method==="POST"&&body===undefined)throw Error("SYNC_INVALID_REQUEST");
 if(typeof authorization!=="string"||!/^Bearer [A-Za-z0-9._~+\/-]{32,}$/.test(authorization))throw Error("SYNC_AUTH_REQUIRED");
 const requestHeaders={"accept":"application/json","authorization":authorization};
 if(body!==undefined)requestHeaders["content-type"]="application/json";
 // Bound stalled network calls so an offline worker can release its scope lock and retry later.
 const response=await fetchImpl(target.href,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body),redirect:"error",signal:timeoutSignal ?? AbortSignal.timeout(30_000)});
 validateSyncApiResponse(response);
 let result;
 try {result=await response.json();}catch{throw Error("SYNC_MALFORMED_JSON");}
 if(!result||typeof result!=="object"||Array.isArray(result)||result.ok!==true)throw Error("SYNC_INVALID_PAYLOAD_RESPONSE");
 return result;
}
