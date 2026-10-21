import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseCreatorDraft,parsePortfolioDraft,validCreatorHandle,creatorCanBeSeen,CREATOR_PORTFOLIO_LIMIT} from "../lib/creator/profile-policy.ts";
const source=p=>readFileSync(new URL(p,import.meta.url),"utf8");

test("customer creator identity starts hidden and validates public handle, bio and visibility",()=>{
 assert.equal(validCreatorHandle("art-2026"),true);
 for(const handle of ["a","admin/owner","../orders","space name","a".repeat(41)])assert.equal(validCreatorHandle(handle),false,handle);
 assert.deepEqual(parseCreatorDraft({handle:"My-Art",displayName:"Nina",bio:"Video",visibility:"private"}),{handle:"my-art",displayName:"Nina",bio:"Video",visibility:"private"});
 for(const visibility of [null,"hidden","draft","TRUE",1])assert.equal(parseCreatorDraft({handle:"my-art",displayName:"Nina",bio:"",visibility}),null);
 assert.equal(parseCreatorDraft({handle:"my-art",displayName:"Nina",bio:"x".repeat(1501),visibility:"public"}),null);
 for(const status of [[false,true],[true,false],[false,false]])assert.equal(creatorCanBeSeen("public",...status),false);
 assert.equal(creatorCanBeSeen("private",true,true),false);
 assert.equal(creatorCanBeSeen("public",true,true),true);
});

test("creator portfolio requires explicit personal-media UUID and bounds captions",()=>{
 assert.equal(CREATOR_PORTFOLIO_LIMIT,24);
 assert.deepEqual(parsePortfolioDraft({mediaId:"5fecc6ba-2cba-4c58-8eed-8008c0f247a4",caption:" My artwork "}),{mediaId:"5fecc6ba-2cba-4c58-8eed-8008c0f247a4",caption:"My artwork"});
 assert.equal(parsePortfolioDraft({mediaId:"another-tenant",caption:"x"}),null);
 assert.equal(parsePortfolioDraft({mediaId:"5fecc6ba-2cba-4c58-8eed-8008c0f247a4",caption:"x".repeat(241)}),null);
});

test("migration defaults to private without tenant membership, and public routes enforce it",()=>{
 const sql=source("../migrations/0107_customer_creator_profiles.sql");
 assert.match(sql,/visibility ENUM\('private','public'\) NOT NULL DEFAULT 'private'/);
 assert.match(sql,/REFERENCES users\(id\)/);
 assert.match(sql,/REFERENCES customer_creator_profiles\(user_id\)/);
 const account=source("../lib/creator/authorization.ts");
 assert.match(account,/NOT EXISTS \(SELECT 1 FROM memberships/);
 assert.match(account,/NOT EXISTS \(SELECT 1 FROM platform_admins/);
 const publicRoutes=[
  "../app/creators/page.tsx",
  "../app/creators/[handle]/page.tsx",
  "../app/api/creators/[handle]/avatar/route.ts",
  "../app/api/creators/[handle]/media/[id]/route.ts"
 ];
 for(const path of publicRoutes){
  const route=source(path);
  assert.match(route,/visibility='public'/,path);
  assert.match(route,/NOT EXISTS \(SELECT 1 FROM memberships/,path);
  assert.match(route,/NOT EXISTS \(SELECT 1 FROM platform_admins/,path);
 }
 const profile=source("../app/api/account/creator-profile/route.ts");
 assert.match(profile,/assertSameOrigin\(request\)/);
 assert.match(profile,/WHERE id=\? AND user_id=\?/);
 assert.match(profile,/FROM user_media_library WHERE id=\? AND user_id=\?/);
});
