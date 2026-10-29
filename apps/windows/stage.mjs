import {cp, mkdir, readdir, readFile, writeFile, access} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const standalone = path.join(root, '.next/standalone');
const target = path.join(here, 'staged/site');
// Refuse stale staging; a previous package must never silently mix build outputs.
try {await access(target); throw Error('STAGING_EXISTS: remove apps/windows/staged before staging another build');}
catch (error) {if (error.code !== 'ENOENT') throw error;}
await access(path.join(standalone, 'server.js'));
await access(path.join(root, '.next/BUILD_ID'));
async function noSecrets(folder) {
  for (const entry of await readdir(folder, {withFileTypes: true})) {
    if (entry.isSymbolicLink()) throw Error('SYMLINK_IN_BUILD');
    if (entry.name.startsWith('.env') || /\.(?:pem|pfx|p12|key|sqlite|db)$/i.test(entry.name)) throw Error('PRIVATE_FILE_IN_BUILD');
    if (entry.isDirectory()) await noSecrets(path.join(folder, entry.name));
  }
}
await noSecrets(standalone);
await mkdir(target, {recursive: true});
await cp(standalone, target, {recursive: true});
await cp(path.join(root, 'public'), path.join(target, 'public'), {recursive: true});
await cp(path.join(root, '.next/static'), path.join(target, '.next/static'), {recursive: true});
await noSecrets(target);
await writeFile(path.join(target, 'foon-build.json'), JSON.stringify({
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim(),
  nextBuildId: (await readFile(path.join(root, '.next/BUILD_ID'), 'utf8')).trim(),
  mode: 'original-site-local-connected-preview', cloudReplication: false, orderSync: 'opt-in-plain-takeaway'
}, null, 2));
console.log('Staged original Next.js server and assets without environment files.');
