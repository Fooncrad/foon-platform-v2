// W28 pinned snapshot from the actual cloud production source at main 5e1b369d.
// The original CSS is vendored byte-for-byte. This is UI inventory, NOT an
// authorization or a claim that all 26 backend modules run offline.
import {readFile} from "node:fs/promises";
const snapshotRoot=new URL("../apps/desktop/cloud-parity/main-5e1b369d/",import.meta.url);
const css=["globals.css","merchant-dashboard.css","merchant-operations.css","merchant-experience.css","shared-dashboard-legibility.css","reference-dashboard-layout.css"];
export const cloudCssPaths=Object.freeze(Object.fromEntries(css.map(name=>
 [name,new URL(name,snapshotRoot)])));

export async function cloudUiInventory(){
 const snapshot=JSON.parse(await readFile(new URL("manifest.json",snapshotRoot),"utf8"));
 if(snapshot.type!=="FOON_DESKTOP_UI_PARITY_SNAPSHOT"||
    snapshot.snapshotRef!=="5e1b369d660b197bf645cc52dc7de7f01d07443a"||
    !Array.isArray(snapshot.modules)||snapshot.modules.length!==26||
    !Array.isArray(snapshot.activities)||snapshot.activities.length!==15||
    !Array.isArray(snapshot.channels)||snapshot.channels.length!==8||
    !Array.isArray(snapshot.originalCssFiles)||snapshot.originalCssFiles.length!==6||
    new Set(snapshot.modules.map(m=>m.key)).size!==26||
    snapshot.modules.some(m=>!Array.isArray(m.roles)||!m.roles.length||
      !["pos","orders","kds"].includes(m.key)&&m.offlineWorking)){
   throw Error("W28_CLOUD_PARITY_SNAPSHOT_INVALID");
 }
 return snapshot;
}
