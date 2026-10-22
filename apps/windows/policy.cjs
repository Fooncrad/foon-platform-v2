'use strict';
function validateConfiguration(value) {
  if (!value || Object.keys(value).some(key => !['databaseUrl', 'port', 'sync'].includes(key))) throw Error('INVALID_CONFIGURATION');
  const url = new URL(value.databaseUrl);
  // A desktop setup must never accidentally point at the production database.
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !url.username || !url.password || !/^\/[a-zA-Z0-9_]+$/.test(url.pathname)
    || url.search || url.hash) throw Error('LOCAL_DATABASE_REQUIRED');
  const port = value.port ?? 43871;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_PORT');
  return {databaseUrl: url.href, port, ...(value.sync ? {sync: validateSync(value.sync)} : {})};
}
function validateSync(sync) {
  const {isIP} = require('node:net');
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if(!sync||Object.keys(sync).some(key=>!['cloudUrl','deviceId','tenantId','branchId','actorUserId','token','receiptKey'].includes(key))
    ||!['deviceId','tenantId','branchId','actorUserId'].every(key=>uuid.test(sync[key]))
    ||!/^[a-f0-9]{96}$/.test(sync.token)||!/^[a-f0-9]{64}$/.test(sync.receiptKey))throw Error('INVALID_DEVICE_ENROLLMENT');
  const url=new URL(sync.cloudUrl),host=url.hostname.replace(/\.$/,'');
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!['','443'].includes(url.port)||url.pathname!=='/api/edge/sync'
    ||isIP(host)||host.includes(':')||!host.includes('.')||/(?:^|\.)(localhost|local|internal)$/.test(host))throw Error('INVALID_CLOUD_ENDPOINT');
  return {...sync,cloudUrl:url.href};
}
function parseEnrollment(contents,cloudUrl){
  if(typeof contents!=='string'||Buffer.byteLength(contents)>16384)throw Error('INVALID_DEVICE_ENROLLMENT');
  const values={};
  const keys={FOON_EDGE_DEVICE_ID:'deviceId',FOON_EDGE_TENANT_ID:'tenantId',FOON_EDGE_BRANCH_ID:'branchId',FOON_EDGE_ACTOR_USER_ID:'actorUserId',FOON_EDGE_CLOUD_DEVICE_TOKEN:'token',FOON_EDGE_RECEIPT_SIGNING_KEY:'receiptKey'};
  for(const line of contents.split(/\r?\n/).filter(line=>line.trim())){
    const match=line.match(/^([A-Z_]+)=([^\r\n]+)$/);
    if(!match||values[match[1]]!==undefined||!Object.hasOwn(keys,match[1])&&match[1]!=='FOON_EDGE_ACTOR_ROLE')throw Error('INVALID_DEVICE_ENROLLMENT');
    values[match[1]]=match[2];
  }
  return validateSync({cloudUrl,...Object.fromEntries(Object.entries(keys).map(([key,target])=>[target,values[key]]))});
}
function isSiteNavigation(target, origin) {
  try { const url = new URL(target); return url.origin === origin && !url.username && !url.password; }
  catch { return false; }
}
function serverEnvironment(config, siteRoot) {
  return {
    // Explicit allowlist: never forward inherited production credentials or NODE_OPTIONS.
    SystemRoot: process.env.SystemRoot || 'C:\\Windows',
    TEMP: process.env.TEMP || '', TMP: process.env.TMP || '',
    PATH: process.env.PATH || '',
    NODE_ENV: 'production', NEXT_TELEMETRY_DISABLED: '1',
    HOSTNAME: '127.0.0.1', PORT: String(config.port),
    APP_URL: `http://127.0.0.1:${config.port}`,
    DATABASE_URL: config.databaseUrl, FOON_WINDOWS_SITE_ROOT: siteRoot,
    ...(config.sync ? {FOON_DESKTOP_SYNC_CONFIG: JSON.stringify(config.sync)} : {})
  };
}
module.exports = {validateConfiguration, validateSync, parseEnrollment, isSiteNavigation, serverEnvironment};
