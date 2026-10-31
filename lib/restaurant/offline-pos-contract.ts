export const OFFLINE_POS_CONTRACT_VERSION = 1 as const;

export type OfflinePosChannel = "takeaway" | "dine_in";
export type OfflinePosContract = {
  version: typeof OFFLINE_POS_CONTRACT_VERSION;
  activityCode: string;
  enabled: boolean;
  orderKind: "catalog_sale" | "service_order" | "unsupported";
  channels: readonly OfflinePosChannel[];
  itemPolicy: "simple_unmeasured_no_variants_options" | "online_only";
};

const catalogSalesActivities = new Set([
  "restaurant",
  "cafe",
  "sweets",
  "grocery",
  "clothing",
  "perfume",
  "accessories",
  "watches",
  "gifts",
  "ecommerce",
]);
const serviceActivities = new Set(["carwash", "laundry", "automotive", "salon", "publicworks"]);
const diningActivities = new Set(["restaurant", "cafe"]);
const uuidPattern = /^[a-f0-9-]{36}$/i;

/**
 * A conservative, server-derived capability contract for the encrypted browser POS.
 * Service lifecycles are deliberately excluded from generic takeaway replay.
 */
export function buildOfflinePosContract(activityCode: string): OfflinePosContract {
  const code = String(activityCode ?? "").trim();
  const enabled = catalogSalesActivities.has(code);
  return {
    version: OFFLINE_POS_CONTRACT_VERSION,
    activityCode: code,
    enabled,
    orderKind: enabled ? "catalog_sale" : serviceActivities.has(code) ? "service_order" : "unsupported",
    channels: enabled ? (diningActivities.has(code) ? ["takeaway", "dine_in"] : ["takeaway"]) : [],
    itemPolicy: enabled ? "simple_unmeasured_no_variants_options" : "online_only",
  };
}

/**
 * Validate the restricted envelope emitted by the encrypted local POS.
 * The normal order path still revalidates catalog, price, stock, tax and branch state.
 */
export function offlinePosEnvelopeAllowed(contract: OfflinePosContract, body: Record<string, unknown>): boolean {
  if (!contract.enabled || body.offlineContractVersion !== contract.version || body.offlineActivityCode !== contract.activityCode) return false;
  if (!contract.channels.includes(body.channel as OfflinePosChannel)) return false;
  if (!uuidPattern.test(String(body.branchId ?? "")) || !uuidPattern.test(String(body.requestKey ?? ""))) return false;
  if (body.customerName !== "" || body.customerPhone !== "" || body.couponCode !== null || body.kitchenNotes !== null || body.orderNotes !== null) return false;
  for (const key of ["paymentStatus", "paymentMethod", "customerId", "reservationId", "pickupPointId", "roomNumber"]) {
    if (body[key] !== undefined && body[key] !== null) return false;
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 80) return false;
  for (const item of body.items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const line = item as Record<string, unknown>;
    if (typeof line.id !== "string" || line.id.length < 1 || line.id.length > 36) return false;
    if (!Number.isInteger(line.quantity) || Number(line.quantity) < 1 || Number(line.quantity) > 999) return false;
    if (!Array.isArray(line.options) || line.options.length !== 0) return false;
  }
  if (body.channel === "dine_in") {
    if (!uuidPattern.test(String(body.tableId ?? "")) || !Number.isInteger(body.partySize) || Number(body.partySize) < 1 || Number(body.partySize) > 100) return false;
  } else if (body.tableId != null || body.partySize != null) {
    return false;
  }
  return true;
}
