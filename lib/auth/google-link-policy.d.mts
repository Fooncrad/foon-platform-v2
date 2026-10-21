export declare function googleLinkEligibility(account: {
  status?: string | null;
  email_verified_at?: Date | string | null;
} | null | undefined): "disabled" | "unverified" | "allowed";
