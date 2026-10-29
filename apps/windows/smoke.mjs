// Opt-in Windows integration: creates its own MariaDB data directory and Electron profile.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {mkdtemp, readFile, mkdir, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
import net from 'node:net';
import {createRequire} from 'node:module';
import mysql from 'mysql2/promise';
import {_electron} from '@playwright/test';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
assert.equal(process.platform, 'win32');
const syncRequested=process.argv.includes('--sync');
assert.deepEqual(process.argv.slice(2), syncRequested?['--run','--sync']:['--run']);
assert(!process.env.DATABASE_URL, 'Refusing inherited database context');
const bin = process.env.FOON_TEST_MARIADB_BIN || 'C:/Program Files/MariaDB 11.8/bin';
const scratch = await mkdtemp(path.join(tmpdir(), 'foon-windows-shell-'));
const password = randomBytes(32).toString('hex');
const children = new Set();
let electron, database;
function child(executable, args, extra = {}) {
  const p = spawn(executable, args, {cwd: root, windowsHide: true, env: {...process.env, ...extra}, stdio: ['ignore', 'pipe', 'pipe']});
  children.add(p); p.once('exit', () => children.delete(p));
  return p;
}
async function command(executable, args, extra) {
  const p = child(executable, args, extra); let log = '';
  p.stdout.on('data', data => {log += data;}); p.stderr.on('data', data => {log += data;});
  const [code] = await once(p, 'exit');
  if (code !== 0) {await writeFile(path.join(scratch, 'private-command-error.log'), log); throw Error('FIXTURE_COMMAND_FAILED');}
  return log;
}
try {
  const probe = net.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const data = path.join(scratch, 'database');
  await command(path.join(bin, 'mariadb-install-db.exe'), ['--datadir=' + data, '--port=' + port, '--password=' + password, '--silent']);
  const daemon = child(path.join(bin, 'mariadbd.exe'), ['--no-defaults', '--basedir=' + path.resolve(bin, '..'), '--datadir=' + data, '--bind-address=127.0.0.1', '--port=' + port, '--skip-log-bin', '--innodb-buffer-pool-size=64M', '--log-error=' + path.join(scratch, 'private-db.log')]);
  daemon.stdout.resume(); daemon.stderr.resume();
  for (let attempt = 0; attempt < 100; attempt++) {
    try {database = await mysql.createConnection({host: '127.0.0.1', port, user: 'root', password}); break;}
    catch {await new Promise(resolve => setTimeout(resolve, 200));}
  }
  assert(database, 'Fresh database did not start');
  await database.query('CREATE DATABASE foon_windows_shell_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  const url = `mysql://root:${password}@127.0.0.1:${port}/foon_windows_shell_test`;
  await command(process.execPath, ['scripts/migrate.mjs'], {DATABASE_URL: url});
  const [[count]] = await database.query('SELECT COUNT(*) AS total FROM foon_windows_shell_test.schema_migrations');
  console.log('PASS fresh schema migrations: ' + count.total);
  const profile = path.join(scratch, 'electron-profile');
  await mkdir(profile);
  const electronOptions = {executablePath: createRequire(import.meta.url)('electron'), args: [here], env: {...process.env, FOON_WINDOWS_TEST_PROFILE: profile}, timeout: 30000};
  electron = await _electron.launch(electronOptions);
  const page = await electron.firstWindow();
  await page.waitForSelector('#database');
  await electron.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().forEach(window => window.hide()));
  await page.locator('#database').fill(url);
  await page.locator('#setup button[type="submit"]').click();
  await page.waitForURL('http://127.0.0.1:43871/login', {timeout: 75000});
  assert.equal(await page.evaluate(() => typeof window.foonSetup), 'undefined');
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  const health = await page.evaluate(async () => (await fetch('/api/health')).json());
  assert.equal(health.db, true);
  const vault = await readFile(path.join(profile, 'connection.dpapi'));
  assert(!vault.includes(Buffer.from(password)), 'Credential leaked in vault');
  const origin = 'http://127.0.0.1:43871';
  const registration = await page.evaluate(async ({origin}) => {
    const response = await fetch('/api/auth/register', {method: 'POST', headers: {'content-type': 'application/json', origin}, body: JSON.stringify({name: 'Shell Test', storeName: 'Shell Test', slug: 'windows-shell-test', email: 'shell@test.example', password: 'only-a-fixture-password', kind: 'restaurant', activity: 'restaurant', countryCode: 'SA', currency: 'SAR', region: 'الرياض'})});
    return {status: response.status, body: await response.json()};
  }, {origin});
  assert.equal(registration.status, 201, JSON.stringify(registration.body));
  await page.goto(origin + '/restaurant');
  assert(!page.url().includes('/login'), 'Session cookie did not persist');
  assert((await page.textContent('body')).includes('Shell Test'));
  const screenshot = process.env.FOON_WINDOWS_SMOKE_SCREENSHOT;
  if (screenshot) await page.screenshot({path: screenshot, fullPage: true});
  console.log('PASS DPAPI vault, original local server, registration, session, dashboard, renderer isolation');
  await electron.close(); electron = undefined;
  // Relaunch from the encrypted vault; no setup or network required.
  electron = await _electron.launch(electronOptions);
  const restored = await electron.firstWindow();
  await restored.waitForURL(origin + '/login', {timeout: 75000});
  console.log('PASS encrypted configuration survives application restart');
  if(syncRequested){
    const result=await command(process.execPath,['scripts/desktop-sync.integration.mjs'],{DESKTOP_SYNC_TEST_DATABASE_URL:url,DESKTOP_SYNC_TEST_WORK_DIR:scratch});
    console.log(result.trim());
    console.log('PASS original POS API → durable MySQL outbox → authenticated TLS API → separate cloud MySQL, replay/revocation/status/tax conflict');
  }
} finally {
  await electron?.close().catch(() => {});
  await database?.end().catch(() => {});
  for (const p of children) p.kill();
  // Preserve only this newly created fixture for diagnosis; never delete existing data.
  console.log('Isolated synthetic fixture retained at ' + scratch);
}
