import {readdirSync,readFileSync} from "node:fs";
import {join,relative} from "node:path";
import {fileURLToPath} from "node:url";
import {uiCopy} from "../lib/i18n/ui-copy.ts";

/** Static i18n coverage audit. Does not claim to validate merchant-authored DB content. */
const root=fileURLToPath(new URL("../",import.meta.url));
const arabic=/[\u0600-\u06FF]/u;
const missing=[];
const patterns=[
 /\b(?:translateUi|uiText)\s*\(\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g,
 /\b(?:translateUi|uiText)\s*\(\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g
];
function scan(dir){
 for(const item of readdirSync(dir,{withFileTypes:true})){
  const path=join(dir,item.name);
  if(item.isDirectory()){scan(path);continue;}
  if(!item.isFile()||!/[.](?:tsx?|jsx?|mjs)$/.test(item.name)||item.name==="ui-copy.ts")continue;
  const text=readFileSync(path,"utf8");
  for(const pattern of patterns){
   pattern.lastIndex=0;
   for(const match of text.matchAll(pattern)){
    const key=match[1];
    if(!arabic.test(key)||Object.hasOwn(uiCopy,key))continue;
    const line=text.slice(0,match.index).split("\n").length;
    missing.push({file:relative(root,path).replaceAll("\\","/"),line,key});
   }
  }
 }
}
for(const directory of ["app","lib"])scan(join(root,directory));
const unique=[...new Map(missing.map(item=>[item.file+":"+item.line+":"+item.key,item])).values()];
unique.sort((a,b)=>a.file.localeCompare(b.file)||a.line-b.line);
console.log("FOON AR/EN/FR static translation keys: "+Object.keys(uiCopy).length+" entries; "+unique.length+" missing usages");
for(const item of unique)console.log(item.file+":"+item.line+"  "+item.key);
if(process.argv.includes("--strict")&&unique.length)process.exitCode=1;
