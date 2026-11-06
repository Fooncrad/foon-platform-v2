import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("display pairing QR uses the configured public APP_URL, not the reverse-proxy request origin", async () => {
  const route = await readFile(new URL("../app/api/display/pairing/route.ts", import.meta.url), "utf8");
  assert.match(route, /const appUrl=process\.env\.APP_URL\?\.trim\(\)/);
  assert.match(route, /new URL\("\/restaurant\/display-pair",appUrl\)/);
  assert.match(route, /publicUrl\.searchParams\.set\("code",code\)/);
  assert.match(route, /publicUrl\.protocol!=="https:"/);
  assert.doesNotMatch(route, /new URL\(req\.url\)\.origin/);
});
