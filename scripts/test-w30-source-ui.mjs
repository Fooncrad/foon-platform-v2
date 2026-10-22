// W30 snapshot contract. Pure file reads; no server, no SQLite, no credentials.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {strict as assert} from 'node:assert';
const root=new URL('../apps/desktop/cloud-parity/main-5e1b369d/',import.meta.url);
const expected=new Map([
 ['globals.css','5085f3ff2b3d7f2f2aee2952bf8da7ea02494313'],
 ['merchant-dashboard.css','7e5c9c56eeee50a3de890df2427c743e07d4d71d'],
 ['merchant-operations.css','9c34f4977a97e186dad9a46918eb862cade0d37a'],
 ['merchant-experience.css','06d4c25e2a047c70c1bc47fbd66a2e785815b123'],
 ['shared-dashboard-legibility.css','8182c3e26aa019cb3431fe9c30024143eab4f2ab'],
 ['reference-dashboard-layout.css','0cffe0109bf98c01668d61278ab3f0a493e0b971'],
 ['workspace-theme-control.css','d3d0410542dacbcf616477ad7f1d7913c12cd8a9']
]);
const manifest=JSON.parse(await readFile(new URL('manifest.json',root),'utf8'));
assert.equal(manifest.snapshotRef,'5e1b369d660b197bf645cc52dc7de7f01d07443a');
assert.equal(manifest.originalCssFiles.length,expected.size);
for(const [name,sha] of expected){
 const content=await readFile(new URL(name,root));
 const blobHeader=Buffer.from('blob '+content.length+'\0');
 const digest=createHash('sha1').update(blobHeader).update(content).digest('hex');
 assert.equal(digest,sha,'FOON original CSS source changed unexpectedly: '+name);
}
const html=await readFile(new URL('./edge-console/index.html',import.meta.url),'utf8');
const consoleJs=await readFile(new URL('./edge-console/console.js',import.meta.url),'utf8');
const layoutCss=await readFile(new URL('./edge-console/w28-shell.css',import.meta.url),'utf8');
for(const name of expected.keys())assert(html.includes('href="/cloud-ui-css/'+name+'"'),'missing original CSS '+name);
for(const label of ['restaurantNavTaskGroup','restaurantNavGroupItems','restaurantPosModern','restaurantPosCatalog','restaurantPosCheckout','restaurantWorkspaceTheme']){
 assert(html.includes(label)||consoleJs.includes(label),'original selector unused: '+label);
}
assert(consoleJs.includes('cloudModules.filter(section=>'),'navigation must use authenticated server section list');
assert(consoleJs.includes('button.disabled=true'),'unported module link must stay disabled');
assert(consoleJs.includes('foon-workspace-theme'),'workspace theme preference missing');
assert(html.includes('لا توجد مزامنة سحابية'),'offline mode must not suggest operational cloud sync');
assert(layoutCss.includes('w30-mobile-open'),'mobile drawer style missing');
console.log('W30 SOURCE UI SNAPSHOT: 7 exact FOON styles, navigation, theme, responsive POS and explicit offline boundary OK.');
