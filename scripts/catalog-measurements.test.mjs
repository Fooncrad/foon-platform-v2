import assert from 'node:assert/strict';
import test from 'node:test';
import {parseCatalogMeasurements,sellingUnits} from '../lib/platform/catalog-measurements.ts';
test('all selling units preserve fractional measurements',()=>{for(const unit of sellingUnits)assert.deepEqual(parseCatalogMeasurements({unit,weightKg:0.25,lengthCm:12.5,widthCm:null,heightCm:0}),{unit,weightKg:0.25,lengthCm:12.5,widthCm:null,heightCm:0})});
test('reject invalid units and malformed dimensions',()=>{const base={unit:'kg',weightKg:1,lengthCm:null,widthCm:null,heightCm:null};for(const bad of [null,[],{}, {...base,unit:'unknown'}, {...base,weightKg:-1},{...base,widthCm:Infinity},{...base,heightCm:'10'},{...base,lengthCm:1000000}])assert.throws(()=>parseCatalogMeasurements(bad))});
