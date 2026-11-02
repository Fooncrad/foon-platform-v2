import test from 'node:test';
import assert from 'node:assert/strict';
import {nextFloorTableNumber,validFloorPlan} from '../lib/restaurant/floor-plan.ts';

const tables=(...numbers)=>numbers.map((number,i)=>({id:`table-${i}`,number,seats:4,x:i,y:0,zone:'Main'}));

test('empty layout starts at table 1',()=>assert.equal(nextFloorTableNumber(tables()),'1'));
test('normal sequence fills first available number',()=>assert.equal(nextFloorTableNumber(tables('1','3')),'2'));
test('leading zeroes reserve the same numeric table',()=>assert.equal(nextFloorTableNumber(tables('01','2')),'3'));
test('whitespace and multiple zeroes are normalized',()=>assert.equal(nextFloorTableNumber(tables(' 0001 ','002')),'3'));
test('non-numeric labels do not reserve numeric slots',()=>assert.equal(nextFloorTableNumber(tables('VIP-1','A2')),'1'));
test('large numeric labels are handled without unsafe Number conversion',()=>assert.equal(nextFloorTableNumber(tables('99999999999999999999','1')),'2'));
test('legacy plan validation is unchanged; saved plans are not rewritten',()=>{
 const plan={width:24,height:18,tables:tables('01','1')};
 assert.equal(validFloorPlan(plan),true);
});
