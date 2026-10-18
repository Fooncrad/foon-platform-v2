// Read-only W11 distribution audit. Run after runtime resources have been
// prepared, BEFORE sharing/installing/signing any NSIS package.
// Does not inspect user data, W05/W06 SQLite, MariaDB, or production.
import {lstat,readdir,readFile} from "node:fs/promises";
import {join,relative,resolve,sep} from "node:path";
import {fileURLToPath} from "node:url";
import {auditFoonDistribution} from "./w11-distribution-policy.mjs";

const desktop=resolve(fileURLToPath(new URL(".",import.meta.url)));
const tauriRoot=join(desktop,"src-tauri");
const buildResourceRoot=join(tauriRoot,"resources","edge-runtime");
const frontendRoot=join(desktop,"ui");

async function collect(directory,root){
  const files=[];
  async function walk(dir){
    let names;
    try{names=await readdir(dir);}catch(error){
      if(error.code==="ENOENT")return;
      throw error;
    }
    for(const name of names){
      const current=join(dir,name);
      const stat=await lstat(current);
      const path=relative(root,current).split(sep).join("/");
      if(stat.isSymbolicLink()){files.push({path,symlink:true});continue;}
      if(stat.isDirectory()){await walk(current);continue;}
      if(!stat.isFile()){files.push({path,symlink:true});continue;}
      files.push({path,size:stat.size,absolute:current});
    }
  }
  await walk(directory);
  return files;
}
async function main(){
  const config=JSON.parse(await readFile(join(tauriRoot,"tauri.conf.json"),"utf8"));
  const resources=await collect(buildResourceRoot,tauriRoot);
  const frontend=await collect(frontendRoot,desktop);
  const sourceTexts={};
  for(const file of [...resources,...frontend]){
    if(!file.symlink&&file.size<=2_000_000&&
       /\.(?:mjs|cjs|js|html|css|json|map|env|pem|key|ts|tsx|sql)$/i.test(file.path)){
      sourceTexts[file.path]=await readFile(file.absolute,"utf8");
    }
  }
  const outcome=auditFoonDistribution({tauri:config,resources,frontend,sourceTexts});
  console.log("W11 SECURITY PACKAGE SURFACE AUDIT");
  console.log("STAGED_RUNTIME_FILES: "+resources.length);
  console.log("WEBVIEW_ASSETS: "+frontend.length);
  for(const warning of outcome.warnings)console.log("NOTICE: "+warning);
  for(const code of outcome.blockers)console.error("BLOCKED: "+code);
  if(!outcome.ok){
    console.error("FOON COMMERCIAL DISTRIBUTION BLOCKED UNTIL EXPOSED CODE/ASSETS ARE REMEDIATED");
    process.exitCode=2;
  }else{
    console.log("W11 BUNDLE HYGIENE PASSED (NOT A GUARANTEE AGAINST REVERSE ENGINEERING)");
  }
}
await main().catch(()=>{
  console.error("W11_PACKAGE_AUDIT_UNAVAILABLE_FAIL_CLOSED");
  process.exitCode=2;
});
