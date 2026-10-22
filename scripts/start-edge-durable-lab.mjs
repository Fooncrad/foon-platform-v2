// W28 development-only persistent station: isolated from production databases.
// Unlike W27 temporary lab, synthetic orders remain in an explicit LOCALAPPDATA
// development folder after stop/restart. NEVER use for real customer payments.
import {randomBytes,randomUUID} from "node:crypto";
import {spawn} from "node:child_process";
import {readFile,writeFile,mkdir,lstat,open} from "node:fs/promises";
import {homedir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {hashOperatorPassword} from "./foon-edge-console-server.mjs";
import {cloudUiInventory} from "./foon-desktop-cloud-ui-inventory.mjs";

if (process.argv.length!==3 || process.argv[2]!=="--development-only") {
  throw Error("W28_EXPLICIT_DEVELOPMENT_ONLY_REQUIRED");
}
if (process.platform!=="win32")throw Error("W28_WINDOWS_REQUIRED");
if (!["24","26"].includes(process.versions.node.split(".")[0]))
  throw Error("W28_NODE_24_OR_26_REQUIRED");
const forbidden=["FOON_LAN_DB","FOON_EDGE_USERS_FILE","FOON_EDGE_CATALOG_CACHE",
  "FOON_EDGE_CLOUD_SYNC_URL","FOON_EDGE_ACK_SECRET","FOON_LAN_TOKEN",
  "FOON_EDGE_RECEIPT_KEYS","FOON_EDGE_DEVICE_ID","FOON_EDGE_TENANT_ID",
  "FOON_EDGE_BRANCH_ID","FOON_W24_TEST_DB_PATH","FOON_W25_TEST_DB_PATH"];
for(const name of forbidden)if(process.env[name])throw Error("W28_PREEXISTING_ENVIRONMENT_REFUSED_"+name);
const appdata=process.env.LOCALAPPDATA;
if(!appdata||!resolve(appdata).toLowerCase().startsWith(resolve(homedir()).toLowerCase()))
  throw Error("W28_LOCAL_APPDATA_REQUIRED");
const home=join(appdata,"FOON","W28-DEVELOPMENT-ONLY");
const coverage=await cloudUiInventory();
const selectedActivity=process.env.FOON_W28_DEMO_ACTIVITY||"restaurant";
if(!coverage.activities.includes(selectedActivity))throw Error("W28_ACTIVITY_NOT_IN_CLOUD_SOURCE");
process.stdout.write("ORIGINAL CLOUD UI: "+coverage.modules.length+" modules, "+
 coverage.activities.length+" activities, "+coverage.channels.length+" order channels.\n");
process.stdout.write("Local working modules: "+
 coverage.modules.filter(item=>item.offlineWorking).map(item=>item.key).join(", ")+
 "; other modules visible but NOT YET IMPLEMENTED OFFLINE.\n");

const meta=join(home,"W28-SYNTHETIC-ONLY.json");
const usersFile=join(home,"users.json");
const cacheFile=join(home,"catalog.json");
const dbFile=join(home,"orders.sqlite");
const lockFile=join(home,"station.lock");
const secretFile=join(home,"service.json");
const hex=n=>randomBytes(n).toString("hex");

await mkdir(home,{recursive:true,mode:0o700});
for(const file of [home,meta,usersFile,cacheFile,dbFile,secretFile]){
  try{if((await lstat(file)).isSymbolicLink())throw Error("W28_UNSAFE_SYMLINK_"+file);}
  catch(e){if(e.code!=="ENOENT")throw e;}
}
let lock;
try{lock=await open(lockFile,"wx",0o600);}catch(e){if(e.code==="EEXIST")throw Error("W28_STATION_ALREADY_RUNNING_OR_STALE_LOCK");throw e;}
let child,created=false;
try{
  let secrets;
  try{
    const [marker,users,cache,stored]=await Promise.all([
      readFile(meta,"utf8"),readFile(usersFile,"utf8"),
      readFile(cacheFile,"utf8"),readFile(secretFile,"utf8")
    ]);
    if(JSON.parse(marker).profile!=="W28-DEVELOPMENT-ONLY"||!Array.isArray(JSON.parse(users))||
      !Array.isArray(JSON.parse(cache)))throw Error("W28_PROFILE_INVALID");
    secrets=JSON.parse(stored);
  }catch(e){
    if(e.code!=="ENOENT")throw e;
    // Fail closed on partial or damaged profiles. Never regenerate device
    // identity or keys for a database which might contain pending events.
    const {existsSync}=await import("node:fs");
    if([meta,usersFile,cacheFile,secretFile,dbFile].some(existsSync))
      throw Error("W28_PARTIAL_PROFILE_REQUIRES_MANUAL_RECOVERY");
    const tenantId=randomUUID(),branchId=randomUUID(),
      deviceCashier=randomUUID(),deviceKitchen=randomUUID(),deviceOwner=randomUUID(),deviceManager=randomUUID(),itemId=randomUUID();
    const password=hex(14);
    const passwd=await hashOperatorPassword(password);
    const users=[
      {username:"owner",role:"owner",tenantId,branchId,deviceId:deviceOwner,
        signingSecret:hex(48),passwordHash:passwd},
      {username:"manager",role:"manager",tenantId,branchId,deviceId:deviceManager,
        signingSecret:hex(48),passwordHash:passwd},
      {username:"cashier",role:"cashier",tenantId,branchId,deviceId:deviceCashier,
        signingSecret:hex(48),passwordHash:passwd},
      {username:"kitchen",role:"kitchen",tenantId,branchId,deviceId:deviceKitchen,
        signingSecret:hex(48),passwordHash:passwd}
    ];
    const savedAt=new Date().toISOString(),validUntil=new Date(Date.now()+7*60*60*1000).toISOString();
    const items=[{id:itemId,name:"Coffee DEMO / قهوة تجريبية",price:"9.50",currency:"SAR",category:"DEMO"}];
    const snapshots=users.map(u=>({identity:{deviceId:u.deviceId,tenantId,branchId,role:u.role},
      savedAt,validUntil,items,orders:[]}));
    secrets={token:hex(48),ackSecret:hex(48)};
    // Exclusive writes prevent silently overwriting a prior profile.
    const files=[[usersFile,users],[cacheFile,snapshots],[secretFile,secrets],
      [meta,{profile:"W28-DEVELOPMENT-ONLY",tenantId,branchId,createdAt:savedAt}]];
    for(const [file,value] of files)await writeFile(file,JSON.stringify(value,null,2),{flag:"wx",mode:0o600});
    created=true;
    process.stdout.write("\nW28 DEVELOPMENT PROFILE CREATED. SAVE THIS PASSWORD SECURELY NOW.\n");
    process.stdout.write("Accounts: owner / manager / cashier / kitchen\nTemporary password (shown ONCE): "+password+"\n");
    process.stdout.write("Authorization expires at: "+validUntil+"\n");
  }
  if(typeof secrets.token!=="string"||secrets.token.length<32||
    typeof secrets.ackSecret!=="string"||secrets.ackSecret.length<32)
    throw Error("W28_SECRETS_INVALID");
  const users=JSON.parse(await readFile(usersFile,"utf8"));
  const cache=JSON.parse(await readFile(cacheFile,"utf8"));
  const {verifyOfflineConsoleCache}=await import("./foon-edge-offline-policy.mjs");
  verifyOfflineConsoleCache(users,cache);
  const port=Number(process.env.FOON_W28_CONSOLE_PORT||8788);
  const gatewayPort=Number(process.env.FOON_W28_GATEWAY_PORT||8787);
  if(!Number.isSafeInteger(port)||port<1||port>65535||
    !Number.isSafeInteger(gatewayPort)||gatewayPort<1||gatewayPort>65535||port===gatewayPort)
    throw Error("W28_LOCAL_PORT_INVALID");
  const origin="http://127.0.0.1:"+port;
  const root=fileURLToPath(new URL("../",import.meta.url));
  const env={...process.env,FOON_EDGE_OFFLINE_ONLY:"1",FOON_EDGE_USERS_FILE:usersFile,
    FOON_EDGE_CATALOG_CACHE:cacheFile,FOON_LAN_DB:dbFile,
    FOON_LAN_TOKEN:secrets.token,FOON_EDGE_ACK_SECRET:secrets.ackSecret,
    FOON_LAN_PORT:String(gatewayPort),FOON_EDGE_CONSOLE_PORT:String(port),
    FOON_EDGE_CONSOLE_HOST:"127.0.0.1",FOON_EDGE_CONSOLE_ORIGIN:origin,
    FOON_EDGE_CONSOLE_CERT_FILE:"",FOON_EDGE_CONSOLE_KEY_FILE:"",FOON_W28_DEMO_ACTIVITY:selectedActivity};
  process.stdout.write("\nFOON W28 LOCAL DEVELOPMENT: "+origin+"\n");
  process.stdout.write("SQLite and pending Outbox PERSIST after shutdown: "+dbFile+"\n");
  process.stdout.write("This development profile is NOT commercial POS. Offline lease is NOT extended.\n");
  child=spawn(process.execPath,["scripts/start-edge-console.mjs"],{cwd:root,env,stdio:"inherit",windowsHide:false});
  const stop=()=>child?.kill("SIGTERM");
  process.once("SIGINT",stop);process.once("SIGTERM",stop);
  const exit=await new Promise((resolve,reject)=>{child.once("error",reject);child.once("exit",(code,signal)=>resolve({code,signal}));});
  if(exit.code!==0&&exit.signal!=="SIGTERM")throw Error("W28_LOCAL_STATION_EXITED_"+exit.code);
} finally {
  await lock?.close();
  const {unlink}=await import("node:fs/promises");
  await unlink(lockFile).catch(()=>{});
  if(created)process.stdout.write("W28 profile kept on disk; do not delete or edit its SQLite/WAL files.\n");
}
