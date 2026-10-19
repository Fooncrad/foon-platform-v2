import test from "node:test";
import assert from "node:assert/strict";
import {classifyExtractedFileNames} from "./w23-extracted-file-policy.mjs";

test("W23 validates a synthetic NSIS inventory without bundled backend files", () => {
  assert.deepEqual(classifyExtractedFileNames([
    "$PLUGINSDIR/modern-wizard.bmp",
    "application/foon-desktop.exe",
    "installer/uninstall.exe"
  ]), {ok:true,blockers:[]});
});
test("W23 rejects unpacked Node runtime even if the shell is compiled Rust", () => {
  const result=classifyExtractedFileNames(["app/foon-desktop.exe","app/edge-runtime/node.exe"]);
  assert.equal(result.ok,false);
  assert(result.blockers.includes("W23_FORBIDDEN_PATH_SEGMENT"));
  assert(result.blockers.includes("W23_BUNDLED_NODE_RUNTIME"));
});
test("W23 rejects all raw backend JavaScript, source maps and secret file types", () => {
  const result=classifyExtractedFileNames([
    "app/scripts/foon-lan-sqlite.mjs", "app/main.cjs", "assets/app.js",
    "app/gateway.ts", "app/source.map","app/.env.local","app/backup.sql",
    "app/orders.sqlite","app/renderer.asar"
  ]);
  assert.equal(result.ok,false);
  assert(result.blockers.includes("W23_BUNDLED_SOURCE_OR_DATA"));
});
test("W23 refuses a nested 7z/zip archive not recursively inspected", () => {
  const result=classifyExtractedFileNames(["app/foon-desktop.exe","$PLUGINSDIR/app-64.7z"]);
  assert.equal(result.ok,false);
  assert(result.blockers.includes("W23_UNEXTRACTED_NESTED_ARCHIVE"));
});
test("W23 fails closed when extraction yields no files or malicious paths", () => {
  assert.equal(classifyExtractedFileNames([]).ok,false);
  assert.equal(classifyExtractedFileNames(["../outside"]).ok,false);
  assert.equal(classifyExtractedFileNames(["ok.exe","\0"]).ok,false);
});
test("W23 correctly handles Windows path separators and case-insensitive extensions", () => {
  assert.equal(classifyExtractedFileNames(["app\\Edge-Runtime\\Main.MJS"]).ok,false);
  assert.equal(classifyExtractedFileNames(["app\\Node_Modules\\foo.bin"]).ok,false);
});
