import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync(new URL("../migrations/0083_media_studio_social_accounts.sql",import.meta.url),"utf8");
test("media social accounts are tenant-scoped and unique per provider account",()=>{
 assert.match(sql,/CREATE TABLE IF NOT EXISTS tenant_media_social_accounts/);
 assert.match(sql,/UNIQUE KEY uq_media_tenant_provider_account \(tenant_id,provider,provider_account_id\)/);
 assert.match(sql,/FOREIGN KEY \(tenant_id\) REFERENCES tenants\(id\) ON DELETE CASCADE/);
 assert.match(sql,/access_token_ciphertext MEDIUMTEXT/);
 assert.match(sql,/refresh_token_ciphertext MEDIUMTEXT/);
 assert.doesNotMatch(sql,/password\s+(?:VARCHAR|TEXT)/i);
});
test("OAuth state is hashed, tenant-bound, expiring and single-use",()=>{
 assert.match(sql,/state_hash CHAR\(64\)/);
 assert.match(sql,/user_id VARCHAR\(36\) NOT NULL/);
 assert.match(sql,/expires_at TIMESTAMP NOT NULL/);
 assert.match(sql,/consumed_at TIMESTAMP NULL/);
 assert.doesNotMatch(sql,/state_token\s+VARCHAR/i);
});
