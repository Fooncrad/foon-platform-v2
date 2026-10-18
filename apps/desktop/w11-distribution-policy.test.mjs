// W11 pure Node tests. No package, user data, keys or network operations.
import test from "node:test";
import assert from "node:assert/strict";
import {auditFoonDistribution} from "./w11-distribution-policy.mjs";
const tauri={bundle:{active:true,resources:["resources/edge-runtime/**/*"]},
  app:{withGlobalTauri:true}};
const asset=(path)=>({path});
const safeResources=[asset("resources/edge-runtime/node.exe")];
const sampleFrontend=[asset("ui/index.html"),asset("ui/station.js")];
const scan=(extra={})=>auditFoonDistribution({
  tauri,resources:safeResources,frontend:sampleFrontend,...extra
});

test("W11 refuses packaged raw Node/MJS server or business logic source",()=>{
  const output=scan({resources:[...safeResources,
    asset("resources/edge-runtime/scripts/foon-lan-sqlite.mjs")]});
  assert.equal(output.ok,false);
  assert(output.blockers.includes("W11_PLAINTEXT_BACKEND_SOURCE_IN_BUNDLE"));
});
test("W11 refuses secrets, source maps, SQL backups, debug entries and symlinks",()=>{
  for(const file of [
    "resources/edge-runtime/.env.production",
    "resources/edge-runtime/production-db.sql",
    "resources/edge-runtime/a.js.map",
    "resources/edge-runtime/cert.pem"
  ]){
    const output=scan({resources:[...safeResources,asset(file)]});
    assert.equal(output.ok,false,file);
    assert(output.blockers.includes("W11_PRIVATE_OR_DEBUG_ASSET_IN_BUNDLE"),file);
  }
  assert.equal(scan({resources:[...safeResources,
    {path:"resources/edge-runtime/hidden.bin",symlink:true}]}).ok,false);
});
test("W11 identifies credential-like text within staged files without echoing its value",()=>{
  const fakePem="-----BEGIN "+"PRIVATE KEY-----";
  const fakeUri=["mysql","://","tester",":","only-fixture","@","127.0.0.1","/","demo"].join("");
  for(const source of [fakePem,fakeUri]){
    assert(scan({sourceTexts:{"ui/station.js":source}})
      .blockers.includes("W11_POSSIBLE_CREDENTIAL_IN_DISTRIBUTION"));
  }
});
test("W11 fail-closes missing or altered bundle staging",()=>{
  assert(scan({resources:[]}).blockers.includes("W11_RUNTIME_NOT_STAGED"));
  assert(scan({tauri:{bundle:{active:true,resources:["/"]},app:{}}})
    .blockers.includes("W11_UNEXPECTED_BUNDLE_RESOURCES"));
  assert(scan({tauri:{bundle:{active:false,resources:[]},app:{}}})
    .blockers.includes("W11_BUNDLE_CONFIG_INVALID"));
});
test("W11 does not claim an exe/webview is impossible to reverse engineer",()=>{
  const outcome=scan();
  assert.equal(outcome.ok,true);
  assert(outcome.warnings.includes("W11_WEBVIEW_ASSETS_EXTRACTABLE_BY_USERS"));
  assert(outcome.warnings.includes("W11_GLOBAL_TAURI_BRIDGE_ENABLED"));
  assert(outcome.warnings.includes("W11_COMPILED_CLIENT_CODE_IS_STILL_REVERSE_ENGINEERABLE"));
});
