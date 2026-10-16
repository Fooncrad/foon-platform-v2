import test from 'node:test';
import assert from 'node:assert/strict';
import {canReadReceipt} from '../lib/restaurant/receipt-access.ts';
const base={role:'cashier',assigned:true,branchId:'branch-a',grants:[{permission_key:'orders.view',allowed:1,branch_id:null}]};
test('receipt financial access follows management and assigned staff permissions',()=>{assert.equal(canReadReceipt({...base,role:'owner',assigned:false,grants:[]}),true);assert.equal(canReadReceipt(base),true);assert.equal(canReadReceipt({...base,role:'accountant'}),true);for(const role of ['waiter','driver','kitchen','customer'])assert.equal(canReadReceipt({...base,role}),false);});
test('foreign branches, missing grants and exact denials remain closed',()=>{assert.equal(canReadReceipt({...base,assigned:false}),false);assert.equal(canReadReceipt({...base,grants:[]}),false);assert.equal(canReadReceipt({...base,grants:[{permission_key:'orders.view',allowed:1,branch_id:'branch-b'}]}),false);assert.equal(canReadReceipt({...base,grants:[{permission_key:'orders.manage',allowed:1,branch_id:null},{permission_key:'orders.view',allowed:0,branch_id:'branch-a'}]}),false);});
