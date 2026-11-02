import assert from "node:assert/strict";
import {test} from "node:test";
import {normalizedReverseGeocode} from "../lib/tenant/reverse-geocode.ts";

test("reverse geocode extracts localized address and reliable country code",()=>{
 const result=normalizedReverseGeocode({status:"OK",results:[{formatted_address:"شارع العليا، الرياض، السعودية",address_components:[
 {long_name:"Saudi Arabia",short_name:"SA",types:["country","political"]},
 {long_name:"الرياض",short_name:"الرياض",types:["locality","political"]}
 ]}]});
 assert.deepEqual(result,{countryCode:"SA",city:"الرياض",address:"شارع العليا، الرياض، السعودية"});
});
test("reverse geocode rejects missing country, city or malformed responses",()=>{
 assert.equal(normalizedReverseGeocode({status:"ZERO_RESULTS",results:[]}),null);
 assert.equal(normalizedReverseGeocode({status:"OK",results:[{formatted_address:"???",address_components:[]}]}),null);
 assert.equal(normalizedReverseGeocode(null),null);
});
test("reverse geocode uses administrative region when locality is missing",()=>{
 const result=normalizedReverseGeocode({status:"OK",results:[{formatted_address:"Al Jahra, Kuwait",address_components:[
 {long_name:"Kuwait",short_name:"KW",types:["country"]},
 {long_name:"Al Jahra",short_name:"Al Jahra",types:["administrative_area_level_1"]}
 ]}]});
 assert.equal(result?.countryCode,"KW");assert.equal(result?.city,"Al Jahra");
});
