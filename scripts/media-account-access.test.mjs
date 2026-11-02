import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const route=readFileSync(new URL("../app/api/restaurant/media-studio/accounts/route.ts",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/restaurant/media-studio/page.tsx",import.meta.url),"utf8");
test("media account API enforces authentication and tenant-scoped manager access",()=>{
 assert.match(route,/currentUserId\(\)/);
 assert.match(route,/resolveWorkspace\(userId,tenant\)/);
 assert.match(route,/\["owner","manager"\]\.includes\(workspace\.role\)/);
 assert.match(route,/WHERE tenant_id=\?/);
 assert.match(route,/\[workspace\.tenant_id\]/);
 assert.match(route,/Cache-Control":"no-store"/);
});
test("account metadata route does not select or serialize OAuth secrets",()=>{
 const select=route.match(/"SELECT ([^"]+) FROM tenant_media_social_accounts/);
 assert.ok(select);
 assert.doesNotMatch(select[1],/\b(access_token_ciphertext|refresh_token_ciphertext|credentials_ciphertext)\b/i);
 assert.doesNotMatch(route,/SELECT \*/i);
});
test("media page displays connection status and retains role checks",()=>{
 assert.match(page,/FROM tenant_media_social_accounts WHERE tenant_id=\?/);
 assert.match(page,/\["owner","manager"\]\.includes\(workspace\.role\)/);
 assert.match(page,/String\(account\.status\)/);
});
