import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("floor policy editor is remounted per tenant and branch and is role-gated", () => {
  const dashboard = read("app/restaurant/merchant-dashboard.tsx");
  assert.match(dashboard, /FloorBookingPolicyEditor key=\{data\.tenantId\+"\:"\+branch\}/);
  assert.match(dashboard, /\["owner","manager"\]\.includes\(data\.role\)&&!data\.supportReadOnly&&<FloorBookingPolicyEditor/);
});

test("policy loading failure cannot save an old branch's policy", () => {
  const editor = read("app/restaurant/floor-booking-policy-editor.tsx");
  assert.match(editor, /setLoaded\(false\)/);
  assert.match(editor, /setLoaded\(true\)/);
  assert.match(editor, /if \(loading \|\| !loaded \|\| saving\) return/);
  assert.match(editor, /disabled=\{loading \|\| !loaded \|\| saving\}/);
  assert.match(editor, /return \(\) => \{active = false;\}/);
});

test("branch policy editor supports three languages and merchant currency", () => {
  const editor = read("app/restaurant/floor-booking-policy-editor.tsx");
  assert.match(editor, /type Language = "ar" \| "en" \| "fr"/);
  assert.match(editor, /\(\{currency\}\)/);
  assert.match(editor, /"Save branch policy"/);
  assert.match(editor, /"Enregistrer la politique"/);
});

test("oversized policy requests return HTTP 413 instead of misleading 400", () => {
  const route = read("app/api/restaurant/floor-booking-policy/route.ts");
  assert.match(route, /readLimitedJson\(req,4096\)/);
  assert.match(route, /code==="BATCH_TOO_LARGE"\?413:400/);
  assert.match(route, /if\(policy\.enabled\)return NextResponse\.json\(\{ok:false,code:"PAYMENT_SETTLEMENT_INTEGRATION_REQUIRED"\}/);
});
