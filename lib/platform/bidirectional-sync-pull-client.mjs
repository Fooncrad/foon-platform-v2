// Signed cloud pull request builder for an enrolled Windows device.
// Keep query construction in one validated boundary; no arbitrary URL params.
import {requestSyncJson} from "./bidirectional-sync-transport.mjs";
import {validatePullCursor} from "./bidirectional-sync-contract.mjs";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function requestScopedSyncPull({baseUrl,scope,after=0,limit=100,authorization,fetchImpl,timeoutSignal}){
 if(!uuid.test(scope?.tenantId)||!uuid.test(scope?.branchId)||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Error("SYNC_INVALID_PULL_SCOPE");
 validatePullCursor(after);
 const target=new URL(baseUrl);
 if(target.search||target.hash||target.pathname!=="/api/sync/v1/pull")throw Error("SYNC_UNEXPECTED_ENDPOINT");
 target.searchParams.set("tenantId",scope.tenantId);
 target.searchParams.set("branchId",scope.branchId);
 target.searchParams.set("after",String(after));
 target.searchParams.set("limit",String(limit));
 return requestSyncJson({url:target.href,method:"GET",authorization,fetchImpl,timeoutSignal,pullQuery:{tenantId:scope.tenantId,branchId:scope.branchId,after,limit}});
}
