// W31 static source-structure regression: no real POS data or external services.
import {readFile} from "node:fs/promises";
import {strict as assert} from "node:assert";
import {Script} from "node:vm";
await import("./test-w30-source-ui.mjs");
const html=await readFile(new URL("./edge-console/index.html",import.meta.url),"utf8");
const js=await readFile(new URL("./edge-console/console.js",import.meta.url),"utf8");
const css=await readFile(new URL("./edge-console/w28-shell.css",import.meta.url),"utf8");
const translations=await readFile(new URL("./edge-console/translations.js",import.meta.url),"utf8");
new Script(js.replace(/^import\s+[^\n]+\n/,""));
new Script(translations.replace(/^export\s+/,""));
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(ids).size,ids.length,"Duplicate HTML ID");
for(const id of ["menu","search","cart-lines","cart-total","checkout","w31-pos-workspace","w31-pos-categories","w31-item-count","w31-cart-count","w31-tools-toggle","w31-pos-tools"]){
 assert(ids.includes(id),"Missing W31 DOM ID: "+id);
}
for(const selector of ["restaurantPosWorkspace","restaurantPosModern","restaurantPosCatalog","restaurantPosCheckout","restaurantPosSectionHeading","restaurantPosItemCount","restaurantPosCartCount","restaurantPosBrowse","restaurantPosCategories","restaurantPosProduct"]){
 assert(html.includes(selector)||js.includes(selector),"Missing original POS structural selector "+selector);
}
assert(js.includes("root.dataset.signature===signature"),"Category filters should persist across polling");
assert(js.includes("chosen?.focus()"),"Keyboard focus should survive category changes");
assert(js.includes("state.menu.filter(item=>"),"Catalog must use session-scoped local state");
assert(js.includes("activeCategory"),"POS category filter missing");
assert(js.includes('"/api/orders","POST",pendingRequest'),"W27 local idempotent order submit lost");
assert(js.includes('$("w31-pos-workspace").hidden=mode!=="pos"'),"KDS must hide POS checkout");
assert(html.includes("لا توجد مزامنة سحابية"),"Local-only sync notice lost");
assert(!html.includes('name="paymentMethod"')&&!html.includes('name="tableId"'),"Unsupported payment/table controls must not appear");
assert(js.includes('غير مؤكد من السحابة'),"Offline-only order cannot be marked cloud confirmed");
assert(css.includes("#w31-pos-workspace .restaurantPosCheckout"),"Responsive source checkout layout missing");
console.log("W31 LOCAL POS UI: original structure, controls, keyboard navigation and safe offline-only contracts OK.");
