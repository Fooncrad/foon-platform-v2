export type FloorBookingPolicy = {
  enabled: boolean;
  bookingFee: number;
  sessionMinutes: number;
  orderPolicy: "optional" | "required" | "disabled";
  refundPolicy: "restaurant" | "nonrefundable";
};

export const defaultFloorBookingPolicy: FloorBookingPolicy = {
  enabled: false,
  bookingFee: 0,
  sessionMinutes: 90,
  orderPolicy: "optional",
  refundPolicy: "restaurant",
};

export function parseFloorBookingPolicy(x: unknown): FloorBookingPolicy | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const p = x as Record<string, unknown>;
  if (typeof p.enabled !== "boolean" || typeof p.bookingFee !== "number" ||
      !Number.isFinite(p.bookingFee) || p.bookingFee < (p.enabled ? 0.01 : 0) ||
      p.bookingFee > 100000 || typeof p.sessionMinutes !== "number" ||
      !Number.isInteger(p.sessionMinutes) || p.sessionMinutes < 30 || p.sessionMinutes > 360 ||
      typeof p.orderPolicy !== "string" ||
      !["optional", "required", "disabled"].includes(p.orderPolicy) ||
      typeof p.refundPolicy !== "string" ||
      !["restaurant", "nonrefundable"].includes(p.refundPolicy)) return null;

  // Check integer cents with a tiny IEEE-754 tolerance; do not accept a third decimal.
  const cents = p.bookingFee * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-7) return null;
  return {
    enabled: p.enabled,
    bookingFee: Math.round(cents) / 100,
    sessionMinutes: p.sessionMinutes,
    orderPolicy: p.orderPolicy as FloorBookingPolicy["orderPolicy"],
    refundPolicy: p.refundPolicy as FloorBookingPolicy["refundPolicy"],
  };
}

export function canSelectFloorSeat(input: {
  channel: "classic" | "floor";
  feePaid: boolean;
  seatAvailable: boolean;
  layoutLinked: boolean;
  policyEnabled: boolean;
}): boolean {
  return input.channel === "floor" && input.feePaid && input.seatAvailable &&
    input.layoutLinked && input.policyEnabled;
}
