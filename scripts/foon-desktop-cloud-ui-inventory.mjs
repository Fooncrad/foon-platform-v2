// Source-of-truth inventory for Windows UI parity. Never silently drop an
// existing cloud module, activity or order channel from W28's coverage report.
// This is visibility tracking; NOT an authorization or commercial entitlement.
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const cloudDashboard=new URL("../app/restaurant/merchant-dashboard.tsx",import.meta.url);
const cloudOrders=new URL("../app/restaurant/order-workspace.tsx",import.meta.url);
const cloudAssets=[
  "merchant-dashboard.css","merchant-operations.css","merchant-experience.css"
];
export const cloudCssPaths=Object.freeze(Object.fromEntries(cloudAssets.map(name=>
 [name,new URL("../app/restaurant/"+name,import.meta.url)])));

export async function cloudUiInventory() {
 const [dashboard,orders]=await Promise.all([
   readFile(cloudDashboard,"utf8"),readFile(cloudOrders,"utf8")
 ]);
 const section=dashboard.match(/type Section=([^;]+);/);
 const definitions=dashboard.match(/const modules:[\s\S]*?=\[([\s\S]*?)\];/);
 if(!section||!definitions)throw Error("W28_CLOUD_NAV_NOT_FOUND");
 const keys=[...section[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
 const modules=[...definitions[1].matchAll(/\{key:"([^"]+)",label:"([^"]+)",icon:"([^"]+)"(?:,feature:"([^"]+)")?,roles:\[([^\]]+)\]\}/g)]
   .map(m=>({key:m[1],label:m[2],icon:m[3],feature:m[4]||null,
     roles:[...m[5].matchAll(/"([^"]+)"/g)].map(r=>r[1]),
     offlineWorking:["orders","pos","kds"].includes(m[1])}));
 const sourceLabels=dashboard.match(/const sectionTranslations:[\s\S]*?=\{([\s\S]*?)\};/);
 if(!sourceLabels)throw Error("W28_SOURCE_TRANSLATIONS_MISSING");
 const labelTranslations=Object.fromEntries(
   [...sourceLabels[1].matchAll(/([a-zA-Z]+):\{en:"([^"]+)",fr:"([^"]+)"\}/g)]
     .map(x=>[x[1],{en:x[2],fr:x[3]}])
 );
 for(const item of modules){
   item.en=labelTranslations[item.key]?.en||item.label;
   item.fr=labelTranslations[item.key]?.fr||item.label;
 }
 const found=modules.map(x=>x.key);
 if(new Set(keys).size!==keys.length||new Set(found).size!==found.length||
    keys.length!==found.length||keys.some(k=>!found.includes(k)))
   throw Error("W28_CLOUD_NAV_COVERAGE_INCOMPLETE");
 const activitiesText=dashboard.match(/const activityNames:[\s\S]*?=\{([\s\S]*?)\};/);
 const activities=activitiesText?[...activitiesText[1].matchAll(/\b([a-z][a-z0-9_]+):\[/g)].map(x=>x[1]):[];
 if(activities.length<10)throw Error("W28_ACTIVITY_COVERAGE_INCOMPLETE");
 const channelsText=orders.match(/const channels:Record<string,string>=\{([^}]+)\}/);
 if(!channelsText)throw Error("W28_ORDER_CHANNELS_MISSING");
 const channels=[...channelsText[1].matchAll(/([a-z_]+):"/g)].map(x=>x[1]);
 if(channels.length<6)throw Error("W28_ORDER_CHANNELS_INCOMPLETE");
 return {source:"app/restaurant/merchant-dashboard.tsx",modules,activities,channels,
   originalCssFiles:cloudAssets.map(x=>"app/restaurant/"+x)};
}
