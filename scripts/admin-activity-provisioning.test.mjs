import test from "node:test";
import assert from "node:assert/strict";
import {validateAdminBusinessProfile} from "../lib/platform/admin-activity-provisioning.ts";

const known=["restaurant","cafe","sweets","grocery","clothing","perfume","accessories","watches","gifts","ecommerce","carwash","laundry","automotive","salon","publicworks"];
const lookups={
 isActivityType: (value)=>known.includes(value),
 currencyForCountry: (code)=>({SA:"SAR",AE:"AED",FR:"EUR"})[code],
 countryRegions:{SA:["الرياض","مكة المكرمة"],AE:["دبي","أبوظبي"]}
};
const base={countryCode:"SA",region:"الرياض"};

test("all 15 activities provision with a derived business kind, never a guessed kind",()=>{
 assert.equal(known.length,15);
 for(const activity of known){
  const result=validateAdminBusinessProfile({...base,activity},lookups);
  assert.equal(result.ok,true,activity);
  assert.equal(result.kind,["restaurant","cafe","sweets"].includes(activity)?"restaurant":"store",activity);
  assert.equal(result.currency,"SAR");
  assert.equal(result.countryCode,"SA");
 }
});
test("a supported foreign country derives its currency without client control",()=>{
 const result=validateAdminBusinessProfile({activity:"salon",countryCode:"ae",region:"دبي",taxNumber:"  1234  ",currency:"USD"},lookups);
 assert.deepEqual(result,{ok:true,activity:"salon",kind:"store",countryCode:"AE",currency:"AED",region:"دبي",taxNumber:"1234"});
});
test("reject missing, unknown or inherited activity types without a store write",()=>{
 for(const activity of ["","unknown","__proto__","constructor",null]){
  assert.deepEqual(validateAdminBusinessProfile({...base,activity},lookups),{ok:false,code:"ACTIVITY_REQUIRED"});
 }
});
test("reject incompatible supplied kind and invalid regions, currencies or tax fields",()=>{
 const cases=[
  [{...base,activity:"salon",kind:"restaurant"},"INVALID_INPUT"],
  [{...base,activity:"restaurant",kind:"store"},"INVALID_INPUT"],
  [{activity:"grocery",countryCode:"XX",region:"مدينة"},"INVALID_LOCALE"],
  [{activity:"restaurant",countryCode:"SA",region:"دبي"},"INVALID_LOCALE"],
  [{activity:"restaurant",countryCode:"SA",region:""},"INVALID_LOCALE"],
  [{...base,activity:"restaurant",taxNumber:"x".repeat(65)},"INVALID_LOCALE"]
 ];
 for(const [input,code] of cases) assert.deepEqual(validateAdminBusinessProfile(input,lookups),{ok:false,code});
});
