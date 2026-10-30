/** Canonical branch selector shared by authorization and operational reads. */
export function resolveOperationsBranchSelection(
  headerBranch: string | null,
  queryBranch: string | null,
): { branch: string | null; conflict: boolean } {
  const header = headerBranch?.trim() || null;
  const query = queryBranch?.trim() || null;
  return {
    branch: query ?? header,
    conflict: header !== null && query !== null && header !== query,
  };
}
