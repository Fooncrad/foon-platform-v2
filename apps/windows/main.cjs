'use strict';
const {app, BrowserWindow, ipcMain, safeStorage, dialog, utilityProcess, Menu} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {createServer} = require('node:net');
const {validateConfiguration, isSiteNavigation, serverEnvironment} = require('./policy.cjs');
let window, child, quitting = false;
app.setName('FOON Windows Preview');
if (!app.isPackaged && process.env.FOON_WINDOWS_TEST_PROFILE) app.setPath('userData', process.env.FOON_WINDOWS_TEST_PROFILE);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {window?.show(); window?.focus();});
  app.whenReady().then(start).catch(fail);
}
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {quitting = true; child?.kill();});
const setupUrl = pathToFileURL(path.join(__dirname, 'setup.html')).href;
const vault = () => path.join(app.getPath('userData'), 'connection.dpapi');
async function start() {
  if (process.platform !== 'win32' || !safeStorage.isEncryptionAvailable()) throw Error('WINDOWS_ENCRYPTION_REQUIRED');
  Menu.setApplicationMenu(null);
  ipcMain.handle('foon:configure', async (event, input) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== setupUrl) throw Error('UNAUTHORIZED');
    try {
      const config = validateConfiguration(input);
      await launch(config, true);
      return {ok: true};
    } catch {
      child?.kill(); child = undefined;
      return {ok: false};
    }
  });
  window = new BrowserWindow({width: 1440, height: 920, minWidth: 360, minHeight: 480,
    show: !(!app.isPackaged && process.env.FOON_WINDOWS_TEST_PROFILE),
    webPreferences: {preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true}});
  window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.on('will-download', event => event.preventDefault());
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  let config;
  try {config = validateConfiguration(JSON.parse(safeStorage.decryptString(await fs.readFile(vault()))));}
  catch (error) {
    if (error.code !== 'ENOENT') await dialog.showMessageBox(window, {type: 'warning', message: 'تعذر فتح إعداد الاتصال المحمي. أعد إعداد قاعدة البيانات المحلية. / Local configuration could not be opened.'});
    return window.loadURL(setupUrl);
  }
  await launch(config);
}
async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const probe = createServer(); probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}
async function launch(config, persist = false) {
  if (child) throw Error('ALREADY_RUNNING');
  await assertPortFree(config.port);
  const siteRoot = app.isPackaged ? path.join(process.resourcesPath, 'site') : path.join(__dirname, 'staged', 'site');
  await fs.access(path.join(siteRoot, 'server.js'));
  const origin = `http://127.0.0.1:${config.port}`;
  const ownedChild = utilityProcess.fork(path.join(siteRoot, 'server.js'), [], {
    cwd: siteRoot, env: serverEnvironment(config, siteRoot), stdio: 'ignore', serviceName: 'FOON Local Website'
  });
  child = ownedChild;
  let exited = false;
  ownedChild.once('exit', () => {
    exited = true; if (child === ownedChild) child = undefined;
    if (!quitting && window && window.webContents.getURL().startsWith(origin)) fail();
  });
  const deadline = Date.now() + 60000;
  let ready = false;
  while (!exited && Date.now() < deadline) {
    try {
      const response = await fetch(origin + '/api/health', {signal: AbortSignal.timeout(1500), redirect: 'error'});
      const body = await response.json();
      if (response.ok && body.ok === true && body.db === true && body.service === 'foon-platform-v2') {ready = true; break;}
    } catch { /* bounded startup retry; no credentials or server logs reach the UI */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready || exited) {ownedChild.kill(); throw Error('LOCAL_SITE_UNAVAILABLE');}
  if (persist) {
    // Only save after the local server and its database health check succeed.
    const temporary = vault() + '.tmp';
    await fs.writeFile(temporary, safeStorage.encryptString(JSON.stringify(config)), {mode: 0o600});
    await fs.rename(temporary, vault());
  }
  window.webContents.removeAllListeners('will-navigate');
  window.webContents.on('will-navigate', (event, target) => {if (!isSiteNavigation(target, origin)) event.preventDefault();});
  window.webContents.on('will-redirect', (event, target) => {if (!isSiteNavigation(target, origin)) event.preventDefault();});
  await window.loadURL(origin + '/login');
}
function fail() {
  if (quitting) return;
  dialog.showErrorBox('FOON Windows Preview', 'تعذر تشغيل الموقع المحلي. تحقق من قاعدة البيانات وترحيلاتها ثم أعد التشغيل. / The local website could not start. Check the local database and migrations.');
  app.quit();
}
