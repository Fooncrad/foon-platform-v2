'use strict';
function validateConfiguration(value) {
  if (!value || Object.keys(value).some(key => !['databaseUrl', 'port'].includes(key))) throw Error('INVALID_CONFIGURATION');
  const url = new URL(value.databaseUrl);
  // A desktop setup must never accidentally point at the production database.
  if (url.protocol !== 'mysql:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || !url.username || !url.password || !/^\/[a-zA-Z0-9_]+$/.test(url.pathname)
    || url.search || url.hash) throw Error('LOCAL_DATABASE_REQUIRED');
  const port = value.port ?? 43871;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error('INVALID_PORT');
  return {databaseUrl: url.href, port};
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
    DATABASE_URL: config.databaseUrl, FOON_WINDOWS_SITE_ROOT: siteRoot
  };
}
module.exports = {validateConfiguration, isSiteNavigation, serverEnvironment};
