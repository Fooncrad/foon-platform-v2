// W23: security-only diagnostic build policy. This is NOT a commercial POS
// approval and does not suppress W11's block of the legacy Node installer.
// Verify the exact committed Tauri overrides before asking Windows to build.
import {readFile,readdir,lstat} from "node:fs/promises";
import {join,resolve,dirname} from "node:path";
import {fileURLToPath} from "node:url";
const here=resolve(dirname(fileURLToPath(import.meta.url)));
const src=join(here,"src-tauri");
const load=path=>readFile(path,"utf8");
const file=path=>join(here,path);
const fail=code=>{throw Error(code);};
export function inspectNativeProbe({base,override,html,css,cargo,rust}){
  // Git for Windows may check out .rs as CRLF while GitHub stores LF.
  // Normalize only line endings for the SAME strict source-layout assertions.
  // This does not change, strip or loosen any security-sensitive checks.
  const normalizedCargo=String(cargo??"").replace(/\r\n?/g,"\n");
  const normalizedRust=String(rust??"").replace(/\r\n?/g,"\n");
  const blockers=[];
  const demand=(value,reason)=>{if(!value)blockers.push(reason);};
  demand(base?.bundle?.resources?.includes("resources/edge-runtime/**/*"),"W23_LEGACY_BASELINE_CHANGED");
  demand(override?.bundle?.active===true,"W23_PROBE_BUNDLE_INACTIVE");
  demand(Array.isArray(override?.bundle?.resources)&&override.bundle.resources.length===0,
    "W23_PROBE_MUST_EXCLUDE_ALL_BACKEND_RESOURCES");
  demand(override?.build?.frontendDist==="../ui-native-probe","W23_WRONG_PROBE_ASSET_ROOT");
  demand(override?.app?.withGlobalTauri===false,"W23_GLOBAL_TAURI_BRIDGE_FORBIDDEN");
  demand(override?.identifier==="com.foon.desktop.nativeprobe"&&
    override?.identifier!==base?.identifier,"W23_PROBE_INSTALLATION_MUST_BE_ISOLATED");
  demand(override?.productName==="FOON Native Security Probe","W23_PROBE_PRODUCT_NAME_REQUIRED");
  demand(override?.app?.security?.csp?.includes("script-src 'none'")&&
    override?.app?.security?.csp?.includes("connect-src 'none'"),
    "W23_NO_SCRIPT_OR_NETWORK_CSP_REQUIRED");
  demand(!/<script\b|on(?:click|error|load)\s*=|javascript:|__TAURI__|https?:\/\//i.test(html),
    "W23_PROBE_HTML_MUST_BE_STATIC_AND_OFFLINE");
  demand(!/@import|url\(|expression\(|https?:\/\//i.test(css),"W23_PROBE_CSS_EXTERNAL_LOAD_FORBIDDEN");
  demand(/^\[features\]$/m.test(normalizedCargo)&&/^native-probe\s*=\s*\[\]/m.test(normalizedCargo),
    "W23_MISSING_EXPLICIT_RUST_FEATURE");
  demand(normalizedRust.includes('#[cfg(not(feature = "native-probe"))]\nmod demo_orders;')&&
    normalizedRust.includes('#[cfg(not(feature = "native-probe"))]\nmod edge_runtime;'),
    "W23_LEGACY_BACKEND_MUST_NOT_COMPILE_IN_PROBE");
  demand(normalizedRust.includes('#[cfg(feature = "native-probe")]\npub fn run()')&&
    normalizedRust.includes('tauri::Builder::default()'),
    "W23_STATIC_NATIVE_PROBE_ENTRY_REQUIRED");
  demand(normalizedRust.includes('#[cfg(not(feature = "native-probe"))]\npub fn run()'),
    "W23_LEGACY_BUILD_MUST_STAY_UNCHANGED");
  return {ok:blockers.length===0,blockers};
}
const main=async()=>{
  const [base,override,html,css,cargo,rust]=await Promise.all([
    load(join(src,"tauri.conf.json")).then(JSON.parse),
    load(join(src,"tauri.native-probe.conf.json")).then(JSON.parse),
    load(file("ui-native-probe/index.html")),
    load(file("ui-native-probe/style.css")),
    load(join(src,"Cargo.toml")),
    load(join(src,"src/lib.rs"))
  ]);
  const result=inspectNativeProbe({base,override,html,css,cargo,rust});
  if(!result.ok){
    for(const code of result.blockers)console.error("BLOCKED: "+code);
    process.exitCode=2;
    return;
  }
  const entries=await readdir(file("ui-native-probe"));
  for(const name of entries){
    const stat=await lstat(file("ui-native-probe/"+name));
    if(!["index.html","style.css"].includes(name)||!stat.isFile()||stat.isSymbolicLink()){
      console.error("BLOCKED: W23_UNEXPECTED_PROBE_ASSET");
      process.exitCode=2;
      return;
    }
  }
  console.log("W23 NATIVE-ONLY PROBE SOURCE BOUNDARY VALIDATED");
  console.log("NOTE: Source bundle not yet extracted/inspected from a Windows-built NSIS.");
  console.log("NOTE: Not a usable POS; legacy W11 commercial release blocker remains ACTIVE.");
};
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await main().catch(()=>{console.error("W23_AUDIT_UNAVAILABLE_FAIL_CLOSED");process.exitCode=2;});
}
