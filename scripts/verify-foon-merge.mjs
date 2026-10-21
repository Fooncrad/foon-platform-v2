#!/usr/bin/env node
// Independent local validation for FOON V2 PR #183; never deploys, merges or runs migrations.
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const expectedBranch='integration/foon-v2-staff-delivery-room-pos-20261021';
const withDb=process.argv.includes('--local-db');
if(process.argv.includes('--help')){
 console.log('Run on the checked-out PR #183 branch: node scripts/verify-foon-merge.mjs [--local-db]');
 console.log('Without --local-db, runs dependency installation, tests, TypeScript and Next.js build.');
 console.log('With --local-db, also runs destructive fixture tests ONLY against local foon_migration_test.');
 process.exit(0);
}
function block(reason){console.error('FOON_VERIFY_BLOCKED: '+reason);process.exit(2);}
if(Number(process.versions.node.split('.')[0])<24)block('NODE_24_OR_NEWER_REQUIRED');
let branch='',commit='';
try{
 branch=execFileSync('git',['branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();
 commit=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
}catch{block('NOT_A_GIT_CHECKOUT');}
if(branch!==expectedBranch)block('CHECK_OUT_REVIEW_BRANCH_FIRST: '+expectedBranch);
// Next.js can load DATABASE_URL from .env.local/.env.production after this runner starts.
// Refuse these files rather than silently using a live database during build/tests.
for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.test','.env.test.local']){
 const file=join(root,name);
 if(!existsSync(file))continue;
 const vars=readFileSync(file,'utf8');
 if(/^\s*(?:export\s+)?(?:DATABASE_URL|MYSQL_HOST|DB_HOST|MYSQL_URL)\s*=/mi.test(vars))block('MOVE_DATABASE_SETTINGS_OUT_OF_'+name+'_BEFORE_TESTING');
}
// Validate any configured database before running *any* step, since some build scripts
// can import DB modules at build time. A production URL must never be inherited.
if(process.env.DATABASE_URL){
 let url;try{url=new URL(process.env.DATABASE_URL);}catch{block('INVALID_DATABASE_URL');}
 const database=decodeURIComponent(url.pathname.replace(/^\//,''));
 if(!['127.0.0.1','localhost'].includes(url.hostname)||database!=='foon_migration_test')block('PRODUCTION_OR_UNKNOWN_DATABASE_URL_REFUSED');
}else if(withDb)block('LOCAL_DATABASE_URL_REQUIRED');
if(process.env.NODE_ENV==='production'&&process.env.DATABASE_URL)block('PRODUCTION_ENV_WITH_DATABASE_URL_REFUSED');
const npm=process.platform==='win32'?(process.env.ComSpec||'cmd.exe'):'npm';
const steps=[
 ['install',['ci']],
 ['typecheck',['run','typecheck']],
 ['bundle-regressions',['run','test:merge-bundle']],
 ['activity-isolation',['run','test:activities']],
 ['payment-creator',['run','test:payments']],
 ['offline-pos',['run','test:offline-pos']],
 ['offline-privacy',['run','test:offline-workspace-security']],
 ['build',['run','build']]
];
if(withDb)steps.push(['restaurant-operations-local-db',['run','test:operations']],['checkout-local-db',['run','test:checkout:integration']]);
const results=[];
for(const [name,args] of steps){
 console.log('\n=== FOON LOCAL QA: '+name+' ===');
 const start=Date.now();
 const cmdArgs=process.platform==='win32'?['/d','/s','/c','npm',...args]:args;
 const out=spawnSync(npm,cmdArgs,{cwd:root,stdio:'inherit',env:process.env,shell:false});
 const code=typeof out.status==='number'?out.status:1;
 results.push({name,exitCode:code,durationMs:Date.now()-start,error:out.error?.code??null});
 console.log('=== '+name+': '+(code===0?'PASS':'FAIL')+' ===');
 if(name==='install'&&code!==0)break;
}
const report={kind:'FOON_V2_LOCAL_QA',branch,commit,node:process.version,withDb,createdAt:new Date().toISOString(),results,allPassed:results.length===steps.length&&results.every(x=>x.exitCode===0)};
const outDir=join(tmpdir(),'foon-pr183-local-qa');mkdirSync(outDir,{recursive:true});
const reportFile=join(outDir,'foon-pr183-'+Date.now()+'.json');
writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log('\nFOON_QA_RESULT: '+(report.allPassed?'PASS':'BLOCKED'));
console.log('FOON_QA_REPORT: '+reportFile);
process.exitCode=report.allPassed?0:1;
