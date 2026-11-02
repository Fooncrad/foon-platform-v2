import test from "node:test";
import assert from "node:assert/strict";
import {WORKSPACE_THEME_KEY,WORKSPACE_THEME_MODES,WORKSPACE_THEME_LABELS,isWorkspaceTheme,resolveWorkspaceTheme} from "../lib/ux/workspace-theme.ts";
test("three explicit appearance settings are distinct from storefront identity",()=>{
 assert.equal(WORKSPACE_THEME_KEY,"foon-workspace-theme");
 assert.deepEqual(WORKSPACE_THEME_MODES,["system","light","dark"]);
 for(const locale of ["ar","en","fr"]){
  const l=WORKSPACE_THEME_LABELS[locale];
  assert(Object.values(l).every(s=>s.length>0));
 }
});
test("device preference follows system and explicit choices always win",()=>{
 assert.equal(resolveWorkspaceTheme("system",false),"light");
 assert.equal(resolveWorkspaceTheme("system",true),"dark");
 assert.equal(resolveWorkspaceTheme("light",true),"light");
 assert.equal(resolveWorkspaceTheme("dark",false),"dark");
});
test("invalid theme values cannot become UI theme modes",()=>{
 for(const invalid of [null,undefined,"",false,"sepia","LIGHT","auto"])assert.equal(isWorkspaceTheme(invalid),false);
 for(const allowed of WORKSPACE_THEME_MODES)assert.equal(isWorkspaceTheme(allowed),true);
});
