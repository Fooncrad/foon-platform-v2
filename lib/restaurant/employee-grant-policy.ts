// A staff member's grants belong to their current role and branch. They must
// not survive a change to either scope, even if the account remains active.
export function employeeGrantsNeedRevocation(
 previousRole: unknown,
 nextRole: string,
 previousBranch: string | null,
 nextBranch: string | null,
): boolean {
 return previousRole !== nextRole || previousBranch !== nextBranch;
}
