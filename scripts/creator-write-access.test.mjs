import test from 'node:test';
import assert from 'node:assert/strict';
import {creatorWriteAccess} from '../lib/creator/write-access.ts';

const id='customer-a';
const mock=(users,roles)=>{
 const calls=[];
 return {calls,execute:async(sql,params)=>{calls.push({sql,params});return [calls.length===1?users:roles];}};
};
test('active customer without merchant or admin membership is eligible',async()=>{
 const db=mock([{id}],[]);
 assert.equal(await creatorWriteAccess(db,id),'active');
 assert.match(db.calls[0].sql,/status='active' FOR UPDATE/);
 assert.match(db.calls[1].sql,/FROM memberships WHERE user_id=\?/);
 assert.match(db.calls[1].sql,/FROM platform_admins WHERE user_id=\?/);
 assert.deepEqual(db.calls[0].params,[id]);
 assert.deepEqual(db.calls[1].params,[id,id]);
});
test('suspended or deleted customer is blocked before role lookup',async()=>{
 const db=mock([],[]);
 assert.equal(await creatorWriteAccess(db,id),'inactive');
 assert.equal(db.calls.length,1);
});
test('merchant staff identity is disqualified',async()=>{
 assert.equal(await creatorWriteAccess(mock([{id}],[{1:1}]),id),'disqualified');
});
test('platform admin identity is disqualified',async()=>{
 assert.equal(await creatorWriteAccess(mock([{id}],[{1:1}]),id),'disqualified');
});
test('no cross-account data can be read by unscoped SQL',async()=>{
 const db=mock([{id}],[]);await creatorWriteAccess(db,id);
 assert.equal(db.calls.every(c=>c.params.every(p=>p===id)),true);
});
