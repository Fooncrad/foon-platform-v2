import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
import {inspectNativeProbe} from "./w23-native-probe-audit.mjs";
const here=dirname(fileURLToPath(import.meta.url));
const tauri=join(here,"src-tauri");
const [base,override,html,css,cargo,rust]=await Promise.all([
  readFile(join(tauri,"tauri.conf.json"),"utf8").then(JSON.parse),
  readFile(join(tauri,"tauri.native-probe.conf.json"),"utf8").then(JSON.parse),
  readFile(join(here,"ui-native-probe","index.html"),"utf8"),
  readFile(join(here,"ui-native-probe","style.css"),"utf8"),
  readFile(join(tauri,"Cargo.toml"),"utf8"),
  readFile(join(tauri,"src","lib.rs"),"utf8")
]);
const input={base,override,html,css,cargo,rust};
test("W23 isolates native-only probe from W05 saved POS and legacy JS backend",()=>{
  assert.equal(inspectNativeProbe(input).ok,true);
  assert.equal(base.bundle.resources[0],"resources/edge-runtime/**/*");
  assert.deepEqual(override.bundle.resources,[]);
  assert.equal(override.identifier,"com.foon.desktop.nativeprobe");
  assert.notEqual(override.identifier,base.identifier);
});
test("W23 security audit accepts only equivalent Windows CRLF or Unix LF source lines",()=>{
  const checkedOutLikeWindows={
    ...input,
    cargo:cargo.replace(/\n/g,"\r\n"),
    rust:rust.replace(/\n/g,"\r\n")
  };
  const result=inspectNativeProbe(checkedOutLikeWindows);
  assert.deepEqual(result,{ok:true,blockers:[]});

  // Line-ending normalization must not weaken the native source exclusion gate.
  const changed={
    ...checkedOutLikeWindows,
    rust:checkedOutLikeWindows.rust.replace(
      '#[cfg(not(feature = "native-probe"))]\r\nmod edge_runtime;',
      'mod edge_runtime;'
    )
  };
  const blocked=inspectNativeProbe(changed);
  assert.equal(blocked.ok,false);
  assert(blocked.blockers.includes("W23_LEGACY_BACKEND_MUST_NOT_COMPILE_IN_PROBE"));
});
test("W23 never loads scripts, Tauri global bridge, or browser/network resources",()=>{
  assert.equal(override.app.withGlobalTauri,false);
  assert.match(override.app.security.csp,/script-src 'none'/);
  assert.match(override.app.security.csp,/connect-src 'none'/);
  assert.doesNotMatch(html,/<script|__TAURI__|<iframe|<form/i);
  assert.doesNotMatch(css,/@import|url\(/);
});
test("W23 refuses any backend source/resource accidentally introduced to probe",()=>{
  const result=inspectNativeProbe({...input,override:{
    ...override,bundle:{...override.bundle,resources:["resources/edge-runtime/**/*"]}
  }});
  assert.equal(result.ok,false);
  assert(result.blockers.includes("W23_PROBE_MUST_EXCLUDE_ALL_BACKEND_RESOURCES"));
});
test("W23 refuses mistakenly shared app identity and restored Tauri JS bridge",()=>{
  const result=inspectNativeProbe({...input,override:{
    ...override,identifier:base.identifier,
    app:{...override.app,withGlobalTauri:true}
  }});
  assert.equal(result.ok,false);
  assert(result.blockers.includes("W23_PROBE_INSTALLATION_MUST_BE_ISOLATED"));
  assert(result.blockers.includes("W23_GLOBAL_TAURI_BRIDGE_FORBIDDEN"));
});
test("W23 Rust compilation excludes legacy demo runner and only has a static native probe",()=>{
  assert.match(rust,/#\[cfg\(not\(feature = "native-probe"\)\)\]\s*mod edge_runtime;/);
  assert.match(rust,/#\[cfg\(not\(feature = "native-probe"\)\)\]\s*mod demo_orders;/);
  assert.match(rust,/#\[cfg\(feature = "native-probe"\)\]\s*pub fn run\(\)/);
  assert.match(cargo,/native-probe\s*=\s*\[\]/);
  assert.match(override.build.frontendDist,/\.\.\/ui-native-probe/);
});
test("W23 never weakens normal W11 commercial distribution audit or old saved runtime",async()=>{
  const [release,audit]=await Promise.all([
    readFile(join(here,"package.json"),"utf8").then(JSON.parse),
    readFile(join(here,"w11-distribution-policy.mjs"),"utf8")
  ]);
  assert.match(release.scripts["desktop:release"],/w11-distribution-audit\.mjs && tauri build/);
  assert.match(audit,/W11_PLAINTEXT_BACKEND_SOURCE_IN_BUNDLE/);
  assert.match(audit,/W11_UNEXPECTED_BUNDLE_RESOURCES/);
});
