import test from "node:test";
import assert from "node:assert/strict";
import {parseAdminStoreProfile} from "./admin-provision-profile.mjs";
const activities=new Set(["restaurant","cafe","sweets","grocery","clothing","carwash","laundry","salon","publicworks"]);
const currencies={SA:"SAR",AE:"AED",FR:"EUR"};
const opts={validActivities:code=>activities.has(code),currencyForCountry:code=>currencies[code],countryRegions:{SA:["الرياض","مكة المكرمة"],AE:["دبي"]}};
const input={activity:"restaurant",countryCode:"SA",currency:"SAR",region:"الرياض",taxNumber:""};
test("admin-created restaurant carries complete region, currency and restaurant kind",()=>{
 assert.deepEqual(parseAdminStoreProfile(input,opts),{activity:"restaurant",countryCode:"SA",currency:"SAR",region:"الرياض",taxNumber:null,kind:"restaurant"});
});
test("other verticals use store kind and avoid mixing restaurant grants",()=>{
 for(const activity of ["grocery","clothing","carwash","laundry","salon","publicworks"]){
  const parsed=parseAdminStoreProfile({...input,activity},opts);assert.equal(parsed.kind,"store",activity);assert.equal(parsed.activity,activity);
 }
 for(const activity of ["cafe","sweets"])assert.equal(parseAdminStoreProfile({...input,activity},opts).kind,"restaurant");
});
test("rejects bad activity, country, region or forged currency",()=>{
 const overrides=[{activity:"unknown"},{countryCode:"XX"},{currency:"USD"},{region:""},{region:"دبي"},{taxNumber:"x".repeat(65)}];
 for(const over of overrides)assert.equal(parseAdminStoreProfile({...input,...over},opts),null,JSON.stringify(over));
});
test("valid international activity does not require region catalogue if freeform valid",()=>{
 assert.equal(parseAdminStoreProfile({...input,activity:"salon",countryCode:"FR",currency:"EUR",region:"Paris"},opts).region,"Paris");
});
