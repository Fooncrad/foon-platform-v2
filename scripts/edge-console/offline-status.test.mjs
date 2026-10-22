import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("W27 offline-only status is distinct from a disconnected online sync", async () => {
 const js=await readFile(new URL("./console.js",import.meta.url),"utf8");
 const labels=await readFile(new URL("./translations.js",import.meta.url),"utf8");
 assert.match(js,/"offline-only":"دون إنترنت — المزامنة متوقفة"/);
 assert.match(js,/state\.sync\.state==="offline-only"\?"محفوظ محليًا — لم يُرسل للسحابة"/);
 assert.match(js,/offline:"بانتظار الاتصال"/);
 assert.match(labels,/"دون إنترنت — المزامنة متوقفة":\["Offline only — synchronization paused","Hors ligne uniquement — synchronisation suspendue"\]/);
 assert.match(labels,/"محفوظ محليًا — لم يُرسل للسحابة":\["Saved locally — not yet sent to cloud","Enregistrée localement — pas encore envoyée au serveur"\]/);
});
