// W27: explicit offline-only launch gate. Pure validation, no disk or network I/O.
// The local snapshot is still unsigned: this is a development safeguard, not
// approval for merchant deployment. Never extend or bypass the saved lease.
const MAX_LEASE_MS = 8 * 60 * 60 * 1000;

export function offlineOnlySelected(value) {
  if (value === undefined || value === "" || value === "0") return false;
  if (value === "1") return true;
  throw Error("W27_INVALID_OFFLINE_MODE");
}

export function verifyOfflineConsoleCache(users, snapshots, now = Date.now()) {
  if (!Number.isSafeInteger(now) || now < 0 ||
      !Array.isArray(users) || users.length < 1 || users.length > 32 ||
      !Array.isArray(snapshots) || snapshots.length !== users.length) {
    throw Error("W27_OFFLINE_AUTHORIZATION_UNAVAILABLE");
  }
  const byDevice = new Map();
  for (const snapshot of snapshots) {
    const id = snapshot?.identity?.deviceId;
    if (typeof id !== "string" || !id || byDevice.has(id)) {
      throw Error("W27_OFFLINE_CACHE_INVALID");
    }
    byDevice.set(id, snapshot);
  }
  for (const user of users) {
    const snapshot = byDevice.get(user?.deviceId);
    if (!snapshot?.identity ||
        ["deviceId","tenantId","branchId","role"].some(key =>
          typeof user?.[key] !== "string" ||
          snapshot.identity[key] !== user[key]) ||
        !Array.isArray(snapshot.items) ||
        !Array.isArray(snapshot.orders)) {
      throw Error("W27_OFFLINE_SCOPE_OR_CACHE_MISMATCH");
    }
    const savedAt = Date.parse(snapshot.savedAt);
    const validUntil = Date.parse(snapshot.validUntil);
    if (!Number.isFinite(savedAt) || !Number.isFinite(validUntil) ||
        savedAt > now || validUntil <= now ||
        validUntil <= savedAt || validUntil - savedAt > MAX_LEASE_MS) {
      throw Error("W27_OFFLINE_AUTHORIZATION_EXPIRED");
    }
  }
  return { ready: true, devices: byDevice.size };
}
