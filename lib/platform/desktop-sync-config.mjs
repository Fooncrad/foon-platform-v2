import {validateCloudEndpoint} from '../../scripts/foon-edge-sync-bridge.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function desktopSyncConfig(value = process.env.FOON_DESKTOP_SYNC_CONFIG) {
  if (!value) return null;
  let config;
  try{config=typeof value === 'string' ? JSON.parse(value) : value;}catch{throw Error('DESKTOP_SYNC_CONFIGURATION_INVALID');}
  if (!config || typeof config !== 'object' || Array.isArray(config)
    || Object.keys(config).some(key => !['cloudUrl','deviceId','tenantId','branchId','actorUserId','token','receiptKey'].includes(key))
    || !['deviceId','tenantId','branchId','actorUserId'].every(key => uuid.test(config[key]))
    || !/^[a-f0-9]{96}$/.test(config.token) || !/^[a-f0-9]{64}$/.test(config.receiptKey)) throw Error('DESKTOP_SYNC_CONFIGURATION_INVALID');
  const endpoint = validateCloudEndpoint(config.cloudUrl);
  if (endpoint.pathname !== '/api/edge/sync') throw Error('DESKTOP_SYNC_ENDPOINT_INVALID');
  return {...config, cloudUrl: endpoint.href};
}
