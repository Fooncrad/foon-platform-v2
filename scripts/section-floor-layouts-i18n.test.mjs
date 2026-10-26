import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const ui=readFileSync(new URL("../app/restaurant/section-floor-layouts.tsx",import.meta.url),"utf8");
test("language follows FOON preference with RTL Arabic and LTR English/French",()=>{
 assert.match(ui,/useUiLanguage/);
 for(const language of ['"ar":','"en":','"fr":'])assert.ok(ui.includes(language),language);
 assert.match(ui,/dir=\{language==="ar"\?"rtl":"ltr"\}/);
});
test("modern floor editor keeps localized user-facing controls, validation and error messages",()=>{
 for(const label of ["الطاولات ومخططات الصالات","Tables & floor plans","Tables et plans de salle","Floor plan","Plan de salle","SECTIONS_UNAVAILABLE","LAYOUTS_UNAVAILABLE","Could not load existing dining sections","Impossible de charger les sections"])assert.ok(ui.includes(label),label);
 for(const action of ["tr(12)","tr(14)","tr(19)","tr(20)","tr(24)","tr(25)","tr(26)","tr(27)"])assert.ok(ui.includes(action),action);
 assert.doesNotMatch(ui,/setMessage\(\{tr/);
});
test("table numbers and dimensions stay in English digits across all three languages",()=>{
 assert.match(ui,/dir="ltr" lang="en"/);
 assert.match(ui,/latinDigits\(e.target.value\)/);
 assert.match(ui,/englishNumber\(e.target.value\)/);
});