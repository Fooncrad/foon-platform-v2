// W28 laboratory only. Rotate passwords without touching orders, WAL, cached
// identities, original W05/W06 fixtures, device signing keys or cloud data.
// MUST stop W28 station first: process lock blocks credential changes in use.
import {randomBytes} from "node:crypto";
import {readFile,writeFile,rename,lstat,rm} from "node:fs/promises";
import {homedir} from "node:os";
import {join,resolve} from "node:path";
import {hashOperatorPassword} from "./foon-edge-console-server.mjs";
if(process.argv.length!==3||process.argv[2]!=="--development-only")
  throw Error("W28_EXPLICIT_DEV_PASSWORD_ROTATION_REQUIRED");
if(process.platform!=="win32")throw Error("W28_WINDOWS_REQUIRED");
const appdata=process.env.LOCALAPPDATA;
if(!appdata||!resolve(appdata).toLowerCase().startsWith(resolve(homedir()).toLowerCase()))
  throw Error("W28_LOCALAPPDATA_REQUIRED");
const root=join(appdata,"FOON","W28-DEVELOPMENT-ONLY");
const markerFile=join(root,"W28-SYNTHETIC-ONLY.json");
const usersFile=join(root,"users.json"),lockFile=join(root,"station.lock");
for(const file of [root,markerFile,usersFile,lockFile]){
  try{
    const info=await lstat(file);
    if(info.isSymbolicLink())throw Error("W28_SYMLINK_REFUSED");
    if(file===lockFile)throw Error("W28_STOP_STATION_BEFORE_PASSWORD_ROTATION");
  }catch(error){if(error.code!=="ENOENT")throw error;}
}
const marker=JSON.parse(await readFile(markerFile,"utf8"));
if(marker.profile!=="W28-DEVELOPMENT-ONLY")throw Error("W28_WRONG_PROFILE");
const users=JSON.parse(await readFile(usersFile,"utf8"));
if(!Array.isArray(users)||users.length!==4||
   new Set(users.map(x=>x.username)).size!==4||
   new Set(users.map(x=>x.role)).size!==4||
   !["owner","manager","cashier","kitchen"].every(role=>users.some(u=>u.username===role&&u.role===role))||
   users.some(user=>!user.passwordHash?.startsWith("scrypt:")||
    typeof user.signingSecret!=="string"||user.signingSecret.length<32))
  throw Error("W28_SYNTHETIC_ACCOUNTS_MISMATCH");
const generated=[];
for(const user of users){
  const password=randomBytes(18).toString("base64url");
  user.passwordHash=await hashOperatorPassword(password);
  generated.push({username:user.username,password});
}
const temp=usersFile+".rotate-"+randomBytes(8).toString("hex")+".tmp";
try{
  // Refuse to overwrite user data; Windows rename replaces destination as one
  // operation on same volume, existing cached orders are not touched.
  await writeFile(temp,JSON.stringify(users,null,2),{flag:"wx",mode:0o600});
  await rename(temp,usersFile);
}catch(error){await rm(temp,{force:true}).catch(()=>{});throw error;}
process.stdout.write("W28 SYNTHETIC PASSWORD ROTATION SUCCEEDED. SAVE LOCALLY AND DO NOT SHARE.\n");
for(const entry of generated)process.stdout.write(entry.username+": "+entry.password+"\n");
process.stdout.write("Old password invalidated for all 4 users. SQLite orders and Outbox UNCHANGED.\n");
