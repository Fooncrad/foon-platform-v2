/**
 * Convert persisted customer activity timestamps to ISO without throwing.
 * Corrupt or missing dates must not take down the entire customer dashboard.
 */
export function safeCustomerIsoDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
