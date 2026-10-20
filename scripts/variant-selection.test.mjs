import test from "node:test";
import assert from "node:assert/strict";
import {sameOptionSet,findSelectedVariant,validPreselectedOptions} from "../lib/catalog/variant-selection.ts";
const red="11111111-1111-4111-8111-111111111111",large="22222222-2222-4222-8222-222222222222",blue="33333333-3333-4333-8333-333333333333";
const groups=[{type:"single",required:true,min:1,max:1,values:[{id:red},{id:blue}]},{type:"single",required:true,min:1,max:1,values:[{id:large}]}];
const variants=[{id:"variant-red",options:[red,large],stock:3},{id:"variant-blue",options:[blue,large],stock:0}];
test("color/size combinations match independent of option ordering",()=>{
 assert.equal(sameOptionSet([red,large],[large,red]),true);
 assert.equal(findSelectedVariant(variants,[large,red])?.id,"variant-red");
 assert.equal(findSelectedVariant(variants,[blue,red]),undefined);
 assert.equal(sameOptionSet([red,red],[red,red]),false);
});
test("only selections of valid, in-stock combinations prefill customer cart",()=>{
 assert.deepEqual(validPreselectedOptions([large,red],groups,variants),[large,red]);
 assert.deepEqual(validPreselectedOptions([blue,large],groups,variants),[]);
 assert.deepEqual(validPreselectedOptions([red],groups,variants),[]);
 assert.deepEqual(validPreselectedOptions([red,blue,large],groups,variants),[]);
 assert.deepEqual(validPreselectedOptions([red,red,large],groups,variants),[]);
 assert.deepEqual(validPreselectedOptions(["invalid",large],groups,variants),[]);
});
test("never preselect a variant from different source options or malformed data",()=>{
 assert.deepEqual(validPreselectedOptions([red,large],groups,[{id:"foreign",options:[blue,large],stock:5}]),[]);
 assert.deepEqual(validPreselectedOptions(null,groups,variants),[]);
 assert.deepEqual(validPreselectedOptions("123",groups,variants),[]);
 assert.deepEqual(validPreselectedOptions([],groups,variants),[]);
 assert.deepEqual(validPreselectedOptions([],[],[]),[]);
});
