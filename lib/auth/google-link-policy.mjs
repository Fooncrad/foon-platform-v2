/**
 * A Google-verified email is not proof that an existing FOON account was
 * verified by its original registrant. Never silently merge an unverified
 * password account with a Google identity (pre-account takeover).
 */
export function googleLinkEligibility(account) {
  if (!account || account.status !== "active") return "disabled";
  if (!account.email_verified_at) return "unverified";
  return "allowed";
}
