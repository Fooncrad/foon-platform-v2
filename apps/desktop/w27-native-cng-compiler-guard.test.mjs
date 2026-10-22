import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("W27 BCrypt NTSTATUS return code is compared after the unsafe call",async()=>{
 const source=await readFile(new URL("./src-tauri/src/native_signed_catalog.rs",import.meta.url),"utf8");
 assert.match(source,/let verify_status = unsafe\s*\{[\s\S]*?BCryptVerifySignature\(/);
 assert.match(source,/verify_status >= 0/);
 assert.doesNotMatch(source,/\}\s*>=\s*0/);
 assert.doesNotMatch(source,/use serde_json::Value;/);
});
