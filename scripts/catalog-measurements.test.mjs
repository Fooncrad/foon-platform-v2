import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCatalogMeasurements,sellingUnits,validCatalogQuantity,catalogQuantityPolicy} from '../lib/platform/catalog-measurements.ts';
test('all selling units preserve fractional measurements',()=>{for(const unit of sellingUnits)assert.deepEqual(parseCatalogMeasurements({unit,weightKg:0.25,lengthCm:12.5,widthCm:null,heightCm:0}),{unit,weightKg:0.25,lengthCm:12.5,widthCm:null,heightCm:0})});
test('reject invalid units and malformed dimensions',()=>{const base={unit:'kg',weightKg:1,lengthCm:null,widthCm:null,heightCm:null};for(const bad of [null,[],{}, {...base,unit:'unknown'}, {...base,weightKg:-1},{...base,widthCm:Infinity},{...base,heightCm:'10'},{...base,lengthCm:1000000}])assert.throws(()=>parseCatalogMeasurements(bad))});

test('measured quantity precision is bounded and explicitly enabled',()=>{
 for(const n of [0.001,0.125,1,1.001,1000])assert.equal(validCatalogQuantity(n),true);
 for(const n of [0,-1,NaN,Infinity,1000.001,0.0001,'0.5',null])assert.equal(validCatalogQuantity(n),false);
 assert.equal(catalogQuantityPolicy({measurements:{unit:'kg',quantityMode:'measured'}}).measured,true);
 assert.equal(catalogQuantityPolicy({measurements:{unit:'piece',quantityMode:'measured'}}).measured,false);
 assert.equal(catalogQuantityPolicy(null).measured,false);
 assert.equal(catalogQuantityPolicy('{invalid').measured,false);
 assert.throws(()=>parseCatalogMeasurements({unit:'piece',quantityMode:'measured',weightKg:null,lengthCm:null,widthCm:null,heightCm:null}));
});

test('quantityMode rejects coercible JSON arrays and non-string values before persistence',()=>{
 const base={unit:'kg',weightKg:1,lengthCm:null,widthCm:null,heightCm:null};
 for(const quantityMode of [['measured'],['whole'],new String('measured'),{toString:()=> 'whole'},null,true,1]){
  assert.throws(()=>parseCatalogMeasurements({...base,quantityMode}),undefined,String(quantityMode));
 }
 assert.equal(parseCatalogMeasurements({...base,quantityMode:'measured'}).quantityMode,'measured');
 assert.equal(parseCatalogMeasurements({...base,quantityMode:'whole'}).quantityMode,'whole');
 assert.equal(catalogQuantityPolicy({measurements:parseCatalogMeasurements({...base,quantityMode:'measured'})}).measured,true);
});
