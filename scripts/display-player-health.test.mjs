import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");
test("display player reports bounded browser health without claiming native display discovery",async()=>{
 const route=await read("app/api/display/[token]/health/route.ts");
 const player=await read("app/display/[token]/display-player.tsx");
 const manager=await read("app/restaurant/display-manager.tsx");
 const migration=await read("migrations/9999_display_player_health_telemetry.sql");
 assert.match(route,/assertSameOrigin/);
 assert.match(route,/readLimitedJson\(req,2048\)/);
 assert.match(route,/allowedPlatforms/);
 assert.match(route,/viewportWidth/);
 assert.match(route,/UPDATE display_screens SET player_health_json/);
 assert.match(player,/\/health/);
 assert.match(player,/setInterval\(\(\)=>void report\(\),30000\)/);
 assert.match(player,/document\.addEventListener\("visibilitychange"/);
 assert.match(player,/MEDIA_PLAYBACK_ERROR/);
 assert.match(player,/onError=\{\(\)=>setMediaError/);
 assert.match(manager,/player_health_at/);
 assert.match(manager,/player_error_code/);
 assert.match(migration,/player_health_json JSON/);
 assert.match(migration,/player_health_at DATETIME/);
});
test("health endpoint rejects invalid and oversized device claims",async()=>{
 const route=await read("app/api/display/[token]/health/route.ts");
 assert.match(route,/v\.viewportWidth<=16384/);
 assert.match(route,/v\.viewportHeight<=16384/);
 assert.match(route,/v\.playbackState==="playing"\|\|v\.playbackState==="idle"\|\|v\.playbackState==="error"/);
 assert.match(route,/v\.errorCode===null/);
});

test("paused screens remain online and the player displays remote pause state",async()=>{
 const route=await read("app/api/display/[token]/health/route.ts");
 const player=await read("app/display/[token]/display-player.tsx");
 assert.doesNotMatch(route,/AND paused=FALSE/);
 assert.ok(player.includes("d.paused"));
 assert.match(player,/تم إيقاف العرض عن بُعد/);
 assert.ok(player.includes('playbackState:paused?"idle"'));
});

test("paused player status is returned only after kiosk PIN verification",async()=>{
 const route=await read("app/api/display/[token]/route.ts");
 const pin=route.indexOf("verifyKioskSession(token");
 const paused=route.indexOf("paused:true");
 assert.ok(pin>=0&&paused>pin,"paused response must follow kiosk PIN validation");
});
