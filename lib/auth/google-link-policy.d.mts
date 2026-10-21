export type GoogleLinkEligibility = "disabled" | "unverified" | "allowed";
export function googleLinkEligibility(account: {status?: unknown; email_verified_at?: unknown} | null | undefined): GoogleLinkEligibility;
