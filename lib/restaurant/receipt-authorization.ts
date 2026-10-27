import type {RowDataPacket} from 'mysql2/promise';
import {database} from '@/lib/db/mysql';
import {requireTenantMembership} from '@/lib/auth/authorization';
import {canReadReceipt} from './receipt-access';
export async function canReadStaffReceipt(user:string,tenant:string,branch:string){
 try{
  const membership=await requireTenantMembership(user,tenant,['owner','manager','cashier','accountant'],false);
  if(['owner','manager'].includes(membership.role))return true;
  const db=database();const [[assigned],[grants]]=await Promise.all([
   db.execute<RowDataPacket[]>('SELECT role FROM employee_branch_assignments WHERE tenant_id=? AND user_id=? AND branch_id=? AND enabled=TRUE LIMIT 2',[tenant,user,branch]),
   db.execute<RowDataPacket[]>('SELECT permission_key,allowed,branch_id FROM employee_permission_grants WHERE tenant_id=? AND user_id=?',[tenant,user])]);
  return canReadReceipt({role:membership.role,assigned:assigned.length===1,assignmentRole:assigned.length===1?String(assigned[0].role):null,grants:grants as {permission_key:string;allowed:number;branch_id:string|null}[],branchId:branch});
 }catch{return false;}
}
