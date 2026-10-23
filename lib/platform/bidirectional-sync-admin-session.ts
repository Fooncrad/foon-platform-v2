// Bridge to the existing FOON session, tenant membership, and branch PIN checks.
// This must only be called from a server-controlled admin action.
import type {RowDataPacket} from "mysql2/promise";
import {currentActiveAdminUserId} from "@/lib/auth/session";
import {requireTenantMembership} from "@/lib/auth/authorization";
import {requireAdditionalBranchUnlock} from "@/lib/restaurant/branch-pin";
import {database} from "@/lib/db/mysql";

export async function authorizeCurrentSyncDeviceAdmin(_session:unknown,scope:{tenantId:string;branchId:string}){
 const userId=await currentActiveAdminUserId(false);
 if(!userId)throw new Error("SYNC_ENROLLMENT_FORBIDDEN");
 const membership=await requireTenantMembership(userId,scope.tenantId,["owner","manager"]);
 if(membership.adminAccess)throw new Error("SYNC_ENROLLMENT_FORBIDDEN");
 const [branches]=await database().execute<RowDataPacket[]>(
  "SELECT id FROM branches WHERE id=? AND tenant_id=? AND enabled=TRUE LIMIT 1",
  [scope.branchId,membership.tenantId]
 );
 if(branches.length!==1)throw new Error("SYNC_ENROLLMENT_FORBIDDEN");
 await requireAdditionalBranchUnlock(membership.tenantId,scope.branchId,userId);
 return {verifiedServerSide:true,tenantId:membership.tenantId,branchId:scope.branchId,actorId:userId};
}
