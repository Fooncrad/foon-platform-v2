/** Offline-first Windows station preflight. Never return or log credential values. */
import {isIP} from 'node:net';
import {win32} from 'node:path';

const requiredPaths = ['FOON_EDGE_USERS_FILE', 'FOON_LAN_DB', 'FOON_EDGE_CATALOG_CACHE'];
const secretKeys = ['FOON_LAN_TOKEN', 'FOON_EDGE_ACK_SECRET'];
const deviceId = /^[a-f0-9-]{36}$/i;
const credentials = /^[a-f0-9]{96}$/i;

export function isLocalWindowsDataPath(value) {
  return typeof value === 'string' && /^[a-z]:\\/i.test(value) && win32.isAbsolute(value) &&
    !value.includes('..') && !value.includes('\\\\?\\') && !value.includes('\\\\.\\');
}

export function validateDesktopEnvironment(env, runtime = {platform: process.platform, node: process.versions.node}) {
  const errors = [];
  const add = (code) => {if(!errors.includes(code)) errors.push(code)};
  if (runtime.platform !== 'win32') add('WINDOWS_REQUIRED');
  const major = Number(String(runtime.node ?? '').split('.')[0]);
  if (!Number.isInteger(major) || major < 24 || major > 24) add('NODE_24_REQUIRED');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') add('TLS_BYPASS_FORBIDDEN');
  if (env.FOON_LAN_HOST && env.FOON_LAN_HOST !== '127.0.0.1') add('GATEWAY_LOOPBACK_REQUIRED');
  const gatewayPort = Number(env.FOON_LAN_PORT ?? 8787);
  const consolePort = Number(env.FOON_EDGE_CONSOLE_PORT ?? 8788);
  if (![gatewayPort, consolePort].every(p => Number.isSafeInteger(p) && p > 1024 && p <= 65535) || gatewayPort === consolePort) add('INVALID_LOCAL_PORTS');
  for (const key of requiredPaths) if (!isLocalWindowsDataPath(env[key])) add(`${key}_PRIVATE_ABSOLUTE_PATH_REQUIRED`);
  for (const key of secretKeys) if (typeof env[key] !== 'string' || env[key].length < 32) add(`${key}_MISSING`);
  try {
    const url = new URL(env.FOON_EDGE_CLOUD_SYNC_URL ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search || url.pathname !== '/api/edge/sync' || !url.hostname) add('INVALID_CLOUD_ENDPOINT');
    if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || isIP(url.hostname)) add('PUBLIC_HTTPS_CLOUD_REQUIRED');
  } catch {add('INVALID_CLOUD_ENDPOINT')}
  const host = env.FOON_EDGE_CONSOLE_HOST ?? '127.0.0.1';
  const loopback = ['127.0.0.1', '::1'].includes(host);
  const octets = host.split('.').map(Number);
  const privateIp = isIP(host) === 4 && (octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31);
  if (!loopback && !privateIp) add('CONSOLE_PRIVATE_HOST_REQUIRED');
  if (Boolean(env.FOON_EDGE_CONSOLE_CERT_FILE) !== Boolean(env.FOON_EDGE_CONSOLE_KEY_FILE)) add('CONSOLE_TLS_FILES_REQUIRED');
  if (!loopback && (!env.FOON_EDGE_CONSOLE_CERT_FILE || !env.FOON_EDGE_CONSOLE_KEY_FILE)) add('CONSOLE_TLS_REQUIRED_FOR_LAN');
  if (env.FOON_EDGE_CONSOLE_ORIGIN) {
    try {
      const origin = new URL(env.FOON_EDGE_CONSOLE_ORIGIN);
      const expected = host === '::1' ? '[::1]' : host;
      if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
        Number(origin.port || (origin.protocol === 'https:' ? 443 : 80)) !== consolePort ||
        !(origin.hostname === expected || loopback && origin.hostname === 'localhost') ||
        (!loopback && origin.protocol !== 'https:') ||
        (origin.protocol === 'https:' && (!env.FOON_EDGE_CONSOLE_CERT_FILE || !env.FOON_EDGE_CONSOLE_KEY_FILE))) add('INVALID_CONSOLE_ORIGIN');
    } catch {add('INVALID_CONSOLE_ORIGIN')}
  }
  if (env.FOON_EDGE_CONSOLE_CERT_FILE && !isLocalWindowsDataPath(env.FOON_EDGE_CONSOLE_CERT_FILE)) add('CONSOLE_CERT_PRIVATE_PATH_REQUIRED');
  if (env.FOON_EDGE_CONSOLE_KEY_FILE && !isLocalWindowsDataPath(env.FOON_EDGE_CONSOLE_KEY_FILE)) add('CONSOLE_KEY_PRIVATE_PATH_REQUIRED');
  return {ok: errors.length === 0, errors};
}

export function validateOperatorFile(data) {
  if (!Array.isArray(data) || data.length < 1 || data.length > 32) return {ok:false, errors:['INVALID_EDGE_OPERATORS']};
  const errors = [];
  const seenNames = new Set(), seenDevices = new Set();
  const tenants = new Set(), branches = new Set();
  for (const row of data) {
    if (!row || typeof row !== 'object' || Array.isArray(row) ||
      !/^[a-zA-Z0-9._-]{1,64}$/.test(row.username ?? '') || seenNames.has(row.username) ||
      !['owner', 'manager', 'cashier', 'kitchen'].includes(row.role) ||
      !/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(row.passwordHash ?? '') ||
      !deviceId.test(row.deviceId ?? '') || seenDevices.has(row.deviceId) ||
      !deviceId.test(row.tenantId ?? '') || !deviceId.test(row.branchId ?? '') ||
      !credentials.test(row.cloudToken ?? '') ||
      typeof row.signingSecret !== 'string' || row.signingSecret.length < 32) {
      if (!errors.includes('INVALID_EDGE_OPERATOR')) errors.push('INVALID_EDGE_OPERATOR');
      continue;
    }
    seenNames.add(row.username); seenDevices.add(row.deviceId);
    tenants.add(row.tenantId); branches.add(row.branchId);
  }
  if (tenants.size > 1 || branches.size > 1) errors.push('CROSS_TENANT_OR_BRANCH_OPERATORS');
  return {ok:errors.length === 0, errors};
}
