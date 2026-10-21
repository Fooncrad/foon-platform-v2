import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Source-level regression checks for the uncompiled React checkout.
// Browser interaction still needs to be verified separately.
const src=readFileSync(new URL("../app/[slug]/public-menu.tsx",import.meta.url),"utf8");
test("manual delivery address edits invalidate the nearest-branch suggestion",()=>{
 assert.match(src,/const \[deliveryAddressEdited,setDeliveryAddressEdited\]=useState\(false\)/);
 assert.match(src,/const markDeliveryAddressEdited=\(\)=>\{deliveryFormTouched\.current=true;setDeliveryAddressEdited\(true\);setDeliveryBranchSuggestion\(""\);\}/);
 for(const field of ["deliveryCountryCode","deliveryCity","deliveryAddress"]){
  const start=src.indexOf(`name="${field}"`);
  assert.ok(start>=0,`${field} must be in the form`);
  assert.match(src.slice(start,start+270),/onChange=\{markDeliveryAddressEdited\}/,`${field} must invalidate old GPS branch hint`);
 }
 assert.match(src,/preferredBranchId&&!deliveryAddressEdited&&<p role="status">/);
 assert.match(src,/preferredBranchId&&!deliveryBranchSuggestion&&!deliveryAddressEdited/);
});
test("previous GPS coordinates cannot accompany a changed address",()=>{
 assert.match(src,/String\(f\.get\("deliveryAddress"\)\?\?""\)\.trim\(\)===savedDelivery\.street\.trim\(\)/);
 assert.match(src,/String\(f\.get\("deliveryCity"\)\?\?""\)\.trim\(\)===savedDelivery\.city\.trim\(\)/);
 assert.match(src,/String\(f\.get\("deliveryCountryCode"\)\?\?""\)===savedDelivery\.countryCode/);
});

test("late saved preferences hydrate untouched fields without erasing manual drafts",()=>{
 assert.match(src,/const deliveryFormTouched=useRef\(false\)/);
 assert.match(src,/if\(deliveryFormTouched\.current\)return;/);
 for(const fragment of [
  'key={"delivery-country:"+(savedDelivery?.countryCode??"")}',
  'key={"delivery-city:"+(savedDelivery?.city??"")}',
  'key={"delivery-street:"+(savedDelivery?.street??"")}',
  'key={"delivery-phone:"+(savedDelivery?.phone??"")}'
 ])assert.ok(src.includes(fragment),fragment);
 assert.match(src,/onChange=\{\(\)=>\{deliveryFormTouched\.current=true;\}\} defaultValue=\{savedDelivery\?\.phone/);
});
