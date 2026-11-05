export const DISPLAY_PLAYER_PROTOCOL_VERSION = 1 as const;

export type PlayerPlatform = "windows" | "linux" | "android" | "macos" | "other";
export type DisplayConnector = "hdmi" | "displayport" | "usb-c" | "internal" | "unknown";
export type Compatibility = "compatible" | "limited" | "unsupported";

export type DisplayOutputCapability = {
  id: string;
  connector: DisplayConnector;
  connected: boolean;
  width: number | null;
  height: number | null;
  refreshRateHz: number | null;
  hdr: boolean;
};

export type PlayerCapabilities = {
  protocolVersion: typeof DISPLAY_PLAYER_PROTOCOL_VERSION;
  platform: PlayerPlatform;
  architecture: string;
  playerVersion: string;
  outputs: DisplayOutputCapability[];
  decoders: string[];
  offlineCache: boolean;
  websocket: boolean;
  reportedAt: string;
};

export type PlayerCompatibility = {
  status: Compatibility;
  connectedOutputs: number;
  capable4kOutputs: string[];
  reasons: string[];
};

const validDimension = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 16384;

export function validatePlayerCapabilities(value: unknown): value is PlayerCapabilities {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (item.protocolVersion !== DISPLAY_PLAYER_PROTOCOL_VERSION) return false;
  if (!["windows", "linux", "android", "macos", "other"].includes(String(item.platform))) return false;
  if (typeof item.architecture !== "string" || item.architecture.length > 32) return false;
  if (typeof item.playerVersion !== "string" || item.playerVersion.length > 64) return false;
  if (typeof item.offlineCache !== "boolean" || typeof item.websocket !== "boolean") return false;
  if (typeof item.reportedAt !== "string" || !Number.isFinite(Date.parse(item.reportedAt))) return false;
  if (!Array.isArray(item.decoders) || item.decoders.length > 32 ||
      !item.decoders.every(x => typeof x === "string" && x.length <= 32)) return false;
  if (!Array.isArray(item.outputs) || item.outputs.length > 32) return false;
  return item.outputs.every(output => {
    if (!output || typeof output !== "object") return false;
    const o = output as Record<string, unknown>;
    return typeof o.id === "string" && o.id.length > 0 && o.id.length <= 80 &&
      ["hdmi", "displayport", "usb-c", "internal", "unknown"].includes(String(o.connector)) &&
      typeof o.connected === "boolean" && typeof o.hdr === "boolean" &&
      (o.width === null || validDimension(o.width)) &&
      (o.height === null || validDimension(o.height)) &&
      (o.refreshRateHz === null || (typeof o.refreshRateHz === "number" && o.refreshRateHz > 0 && o.refreshRateHz <= 1000));
  });
}

export function classifyPlayerCompatibility(capabilities: PlayerCapabilities): PlayerCompatibility {
  const connected = capabilities.outputs.filter(output => output.connected);
  const hasH264 = capabilities.decoders.some(codec => codec.toLowerCase() === "h264");
  const capable4kOutputs = connected
    .filter(output => (output.width ?? 0) >= 3840 && (output.height ?? 0) >= 2160)
    .map(output => output.id);
  const reasons: string[] = [];
  if (connected.length === 0) reasons.push("NO_CONNECTED_DISPLAY_OUTPUT");
  if (!hasH264) reasons.push("H264_DECODER_NOT_REPORTED");
  if (connected.some(output => (output.width ?? 0) < 1920 || (output.height ?? 0) < 1080))
    reasons.push("ONE_OR_MORE_OUTPUTS_BELOW_FULL_HD");
  const status: Compatibility = connected.length === 0 ? "unsupported" :
    hasH264 && connected.some(output => (output.width ?? 0) >= 1920 && (output.height ?? 0) >= 1080)
      ? "compatible" : "limited";
  if (capable4kOutputs.length === 0) reasons.push("NO_OUTPUT_NEGOTIATED_AT_4K");
  return { status, connectedOutputs: connected.length, capable4kOutputs, reasons };
}

/** One device owns one playlist/timeline; each connected output mirrors that timeline. */
export function createUnifiedPlaybackPlan<T>(playlist: T[], capabilities: PlayerCapabilities) {
  return {
    mode: "unified" as const,
    protocolVersion: DISPLAY_PLAYER_PROTOCOL_VERSION,
    outputIds: capabilities.outputs.filter(output => output.connected).map(output => output.id),
    playlist,
    audioPresenceRequired: false as const,
  };
}
