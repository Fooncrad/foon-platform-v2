/** Prevent an unverified local password account from being claimed by OAuth. */
export function googleLinkEligibility(account) {
  if (!account || account.status !== "active") return "disabled";
  if (!account.email_verified_at) return "unverified";
  return "allowed";
}
