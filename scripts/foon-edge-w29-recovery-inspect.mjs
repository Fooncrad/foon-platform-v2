// FOON Windows W29: read-only inspection of the synthetic W28 SQLite profile.
// Does not unlock, repair, reset, restore, import, delete, or access cloud.
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,resolve} from 'node:path';

if(process.argv.length!==3||process.argv[2]!=='--development-only') throw Error('W29_EXPLICIT_DEVELOPMENT_ONLY_REQUIRED');
if(process.platform!=='win32') throw Error('W29_WINDOWS_REQUIRED');
const appdata=process.env.LOCALAPPDATA;
if(!appdata||!resolve(appdata).toLowerCase().startsWith(resolve(homedir()).toLowerCase())) throw Error('W29_LOCAL_APPDATA_REQUIRED');
const dir=join(appdata,'FOON','W28-DEVELOPMENT-ONLY');
const file=join(dir,'orders.sqlite');
const meta=JSON.parse(await readFile(join(dir,'W28-SYNTHETIC-ONLY.json'),'utf8'));
if(meta.profile!=='W28-DEVELOPMENT-ONLY'||typeof meta.tenantId!=='string'||typeof meta.branchId!=='string') throw Error('W29_NOT_SYNTHETIC_PROFILE');
const files=[dir,file,join(dir,'catalog.json'),join(dir,'users.json')];
for(const name of files){const st=await lstat(name);if(st.isSymbolicLink())throw Error('W29_UNSAFE_SYMLINK');}
const users=JSON.parse(await readFile(join(dir,'users.json'),'utf8'));
const cache=JSON.parse(await readFile(join(dir,'catalog.json'),'utf8'));
if(!Array.isArray(users)||!Array.isArray(cache)||users.length!==cache.length||!users.length)throw Error('W29_PROFILE_MISMATCH');
const at=Date.now();let grantExpired=false;
for(const user of users){
 const snap=cache.find(c=>c?.identity?.deviceId===user.deviceId);
 if(!snap||['tenantId','branchId','deviceId','role'].some(k=>snap.identity[k]!==user[k])||user.tenantId!==meta.tenantId||user.branchId!==meta.branchId)throw Error('W29_PROFILE_SCOPE_MISMATCH');
 const savedAt=Date.parse(snap.savedAt),validUntil=Date.parse(snap.validUntil);
 if(!Number.isFinite(savedAt)||!Number.isFinite(validUntil)||savedAt>at||validUntil-savedAt>28800000)throw Error('W29_CACHE_POLICY_INVALID');
 if(validUntil<=at)grantExpired=true;
}
let db;
try{
 db=new DatabaseSync(file,{readOnly:true});
 const res=db.prepare('PRAGMA quick_check').get();
 if(Object.values(res)[0]!=='ok')throw Error('W29_SQLITE_QUICK_CHECK_FAILED');
 const count=t=>Number(db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n);
 const orders=count('orders'),events=count('events'),pending=Number(db.prepare('SELECT count(*) AS n FROM outbox WHERE synced_at IS NULL').get().n);
 if(events<orders||pending>events)throw Error('W29_EVENT_OUTBOX_COUNTS_INVALID');
 const cross=db.prepare('SELECT count(*) AS n FROM orders WHERE branch_id<>?').get(meta.branchId).n;
 if(Number(cross)!==0)throw Error('W29_DATABASE_BRANCH_MISMATCH');
 const status=await lstat(join(dir,'station.lock')).then(()=> 'present (running or stale)',e=>e.code==='ENOENT'?'absent':Promise.reject(e));
 const backups=await readdir(join(dir,'backups')).catch(e=>e.code==='ENOENT'?[]:Promise.reject(e));
 const result={profile:'W28-DEVELOPMENT-ONLY',databaseIntegrity:'ok',orders,events,unsyncedOutbox:pending,
   activeLock:status,offlineGrant:grantExpired?'expired - requires signed renewal':'valid at inspection time',
   backupCount:backups.filter(f=>/\.sqlite$/.test(f)).length,
   instruction:status==='absent'?'Safe to run normal launcher if lease valid.':'Never remove lock or database files while any W28 station might be running.'};
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{db?.close();}
