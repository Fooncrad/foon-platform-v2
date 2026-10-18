// W12 source safety assertions only: does not attempt to access Windows
// secrets on non-Windows machines. Actual DPAPI round-trip is Rust on Windows.
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {join,dirname} from "node:path";
import {fileURLToPath} from "node:url";

const dir=dirname(fileURLToPath(import.meta.url));
const root=join(dir,"src-tauri","src");
const [moduleText,libText,runtimeText,frontend]=await Promise.all([
  readFile(join(root,"windows_secret_store.rs"),"utf8"),
  readFile(join(root,"lib.rs"),"utf8"),
  readFile(join(root,"edge_runtime.rs"),"utf8"),
  readFile(join(dir,"ui","index.html"),"utf8")
]);

test("W12 DPAPI is compiled only on Windows and not exposed as a Tauri command",()=>{
  assert.match(libText,/#\[cfg\(windows\)\]\s*mod windows_secret_store;/);
  assert.match(moduleText,/#!\[cfg\(windows\)\]/);
  assert(!libText.includes("windows_secret_store::seal"));
  assert(!libText.includes("windows_secret_store::unseal"));
  assert(!libText.includes("windows_secret_store::DeviceSecret"));
  assert(!/\#\[tauri::command\]/.test(moduleText));
  assert(!/invoke\s*\([^)]*(?:unseal|decrypt|secret)/i.test(frontend));
});

test("W12 does not use machine-scoped DPAPI or plaintext disk persistence",()=>{
  assert(moduleText.includes('#[link(name = "Crypt32")]'));
  assert(moduleText.includes("CryptProtectData"));
  assert(moduleText.includes("CryptUnprotectData"));
  assert(moduleText.includes("UI_FORBIDDEN"));
  assert(!moduleText.includes("CRYPTPROTECT_LOCAL_MACHINE"));
  assert(!moduleText.includes("std::fs::write"));
  assert(!moduleText.includes("File::create"));
  assert(!/console\.log|println!|eprintln!/.test(moduleText));
});

test("W12 is independent of existing W05 saved SQLite and cloud configuration",()=>{
  assert(!/FOON_LAN_DB|FOON_EDGE_CLOUD_SYNC_URL|EDGE_TEST_DATABASE_URL/.test(moduleText));
  assert(runtimeText.includes("DURABLE_DB_IN_USE"));
  assert(runtimeText.includes("DURABLE_BRANCH_MISSING_FOR_EXISTING_DB"));
  assert(moduleText.includes("DPAPI_UNSEAL_FAILED"));
  assert(moduleText.includes("write_volatile"));
});
