import {randomBytes,scryptSync,timingSafeEqual} from "node:crypto";
import type {RowDataPacket} from "mysql2/promise";
import {database} from "@/lib/db/mysql";
import {currentSessionId} from "@/lib/auth/session";

export class BranchPinError extends Error {
 constructor(public code:"BRANCH_PIN_REQUIRED"|"BRANCH_PIN_SETUP_REQUIRED"|"BRANCH_SELECTION_REQUIRED"){super(code);}
}
const pinFormat=/^[0-9]{6,8}$/;
export function validBranchPin(pin:unknown):pin is string{return typeof pin==="string"&&pinFormat.test(pin);}
export function branchPinHash(pin:string){
 if(!validBranchPin(pin))throw new Error("INVALID_BRANCH_PIN");
 const salt=randomBytes(16).toString("hex");
 return {salt,hash:scryptSync(pin,salt,32).toString("hex")};
}
export function matchesBranchPin(pin:string,salt:string,hash:string){
 if(!validBranchPin(pin)||!/^[0-9a-f]{32}$/.test(salt)||!/^[0-9a-f]{64}$/.test(hash))return false;
 const expected=Buffer.from(hash,"hex"),actual=scryptSync(pin,salt,32);
 return timingSafeEqual(expected,actual);
}
// Apply to every tenant-branch API that reads or mutates protected branch data.
// PIN unlock supplements, never replaces, tenant membership and permission checks.
export async function requireAdditionalBranchUnlock(tenantId:string,branchId:string|null,userId:string){
 const [branches]=await database().execute<RowDataPacket[]>("SELECT id,pin_hash FROM branches WHERE tenant_id=? ORDER BY created_at,id",[tenantId]);
 if(!branches.length)return;
 if(!branchId){
  if(branches.length>1)throw new BranchPinError("BRANCH_SELECTION_REQUIRED");
  return;
 }
 const index=branches.findIndex(b=>String(b.id)===branchId);
 if(index<0)throw new BranchPinError("BRANCH_PIN_REQUIRED");
 if(index===0)return;
 if(!branches[index].pin_hash)throw new BranchPinError("BRANCH_PIN_SETUP_REQUIRED");
 const session=await currentSessionId();
 if(!session)throw new BranchPinError("BRANCH_PIN_REQUIRED");
 const [authorized]=await database().execute<RowDataPacket[]>(
  "SELECT 1 FROM branch_pin_access a JOIN auth_sessions s ON s.id=a.auth_session_id AND s.user_id=? AND s.expires_at>UTC_TIMESTAMP() WHERE a.auth_session_id=? AND a.tenant_id=? AND a.branch_id=? AND a.unlocked_until>UTC_TIMESTAMP() LIMIT 1",
  [userId,session,tenantId,branchId]);
 if(!authorized.length)throw new BranchPinError("BRANCH_PIN_REQUIRED");
}

/** A route returning multiple branch rows must not expose a protected branch
 * merely because no branch filter was supplied. Skip only expected PIN denials;
 * propagate database failures, rather than returning a misleading empty list.
 */
export async function onlyUnlockedBranchRows<T extends {branch_id:unknown}>(tenantId:string,userId:string,rows:T[]):Promise<T[]>{
 const allowed=new Map<string,boolean>();
 const visible:T[]=[];
 for(const row of rows){
  const branchId=typeof row.branch_id==="string"?row.branch_id:null;
  const key=branchId??"";
  if(!allowed.has(key)){
   try{await requireAdditionalBranchUnlock(tenantId,branchId,userId);allowed.set(key,true);}
   catch(error){if(!(error instanceof BranchPinError))throw error;allowed.set(key,false);}
  }
  if(allowed.get(key))visible.push(row);
 }
 return visible;
}

/** Mutations to tenant-wide catalogs or settings affect *every* branch.
 * With additional branches, all of them must be unlocked in this session.
 * This intentionally fails closed until the owner initializes legacy PINs.
 */
export async function requireAllAdditionalBranchesUnlocked(tenantId:string,userId:string){
 const [branches]=await database().execute<RowDataPacket[]>("SELECT id FROM branches WHERE tenant_id=? ORDER BY created_at,id",[tenantId]);
 for(const branch of branches.slice(1))await requireAdditionalBranchUnlock(tenantId,String(branch.id),userId);
}
