/** Explicit employee grants are not transferable across resource roles,
 * membership roles, or branches. Check both role representations because
 * historical resource data may drift from the authoritative membership row.
 */
export type EmployeeGrantScope={
 resourceRole:unknown;
 membershipRole:unknown;
 branchId:string|null;
};
export function employeeGrantsNeedRevocation(previous:EmployeeGrantScope,next:EmployeeGrantScope):boolean{
 return previous.resourceRole!==next.resourceRole ||
  previous.membershipRole!==next.membershipRole ||
  previous.branchId!==next.branchId;
}
