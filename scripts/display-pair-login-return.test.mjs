import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("password sign-in preserves the validated FOON display QR pairing return URL", async () => {
  const page = await readFile(new URL("../app/login/page.tsx", import.meta.url), "utf8");
  assert.match(page, /\^\\\/restaurant\\\/display-pair\\\?code=\\d\{8\}\$/);
  assert.match(page, /router\.replace\(safeNext\)/);
  assert.match(page, /\/receipts\\\//);
});
