import test from "node:test";
import assert from "node:assert/strict";
import {sameOptionSet,findSelectedVariant,validPreselectedOptions,selectedCatalogStockLimit,canAddCatalogUnit} from "../lib/catalog/variant-selection.ts";
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

test("color + size stock is bounded by product, every option, and the variant",()=>{
 const availableGroups=[
  {...groups[0],values:[{id:red,stock:3},{id:blue,stock:0}]},
  {...groups[1],values:[{id:large,stock:2}]}
 ];
 const available=[{id:"red-large",options:[red,large],stock:4},{id:"blue-large",options:[blue,large],stock:9}];
 assert.equal(selectedCatalogStockLimit(availableGroups,available,[red,large],5),2);
 assert.equal(selectedCatalogStockLimit(availableGroups,available,[blue,large],5),0);
 assert.deepEqual(validPreselectedOptions([blue,large],availableGroups,available),[]);
 assert.deepEqual(validPreselectedOptions([red,large],availableGroups,available),[red,large]);
 assert.equal(canAddCatalogUnit(availableGroups,available,[red,large],5,[{options:[red,large],quantity:1}],1),true);
 assert.equal(canAddCatalogUnit(availableGroups,available,[red,large],5,[{options:[red,large],quantity:2}],1),false);
});
test("shared product and option stock cannot be oversold by separate variant lines",()=>{
 const medium="44444444-4444-4444-8444-444444444444";
 const stockGroups=[
  {type:"single",required:true,min:1,max:1,values:[{id:red,stock:5}]},
  {type:"single",required:true,min:1,max:1,values:[{id:large,stock:5},{id:medium,stock:5}]}
 ];
 const variantsTwo=[{id:"large",options:[red,large],stock:10},{id:"medium",options:[red,medium],stock:10}];
 assert.equal(canAddCatalogUnit(stockGroups,variantsTwo,[red,medium],2,[{options:[red,large],quantity:2}],1),false,"product stock shared");
 assert.equal(canAddCatalogUnit(stockGroups,variantsTwo,[red,medium],10,[{options:[red,large],quantity:5}],1),false,"red stock shared");
 assert.equal(canAddCatalogUnit(stockGroups,variantsTwo,[red,medium],10,[{options:[red,large],quantity:4}],1),true);
});
test("measured inventory respects fractional stock and malformed selection",()=>{
 const fractional=[{type:"single",required:true,min:1,max:1,values:[{id:red,stock:0.5}]}];
 const sku=[{id:"measured",options:[red],stock:0.375}];
 assert.equal(selectedCatalogStockLimit(fractional,sku,[red],0.8),0.375);
 assert.equal(canAddCatalogUnit(fractional,sku,[red],0.8,[],0.125),true);
 assert.equal(canAddCatalogUnit(fractional,sku,[red],0.8,[{options:[red],quantity:0.3}],0.1),false);
 assert.equal(selectedCatalogStockLimit(fractional,sku,[red,red]),0);
 assert.equal(selectedCatalogStockLimit(fractional,sku,["unknown"]),0);
});
