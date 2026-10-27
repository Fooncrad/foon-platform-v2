import test from 'node:test';
import assert from 'node:assert/strict';
import {activeDeliveryDriverIds,assignedActiveDeliveryDriver,activeDeliveryDriverEmployeeId} from '../lib/restaurant/delivery-driver-scope.ts';

const tenant='tenant-a', branch='branch-a', user='driver-user', employee='employee-a';
const mock=(rows)=>{
 const calls=[];
 return {calls,db:{async execute(sql,params){calls.push({sql,params});return [rows];}}};
};
const checkScope=(sql)=>{
 assert.match(sql,/m\.tenant_id=e\.tenant_id/);
 assert.match(sql,/a\.tenant_id=e\.tenant_id AND a\.user_id=m\.user_id/);
 assert.match(sql,/a\.branch_id=\? AND a\.enabled=TRUE/);
 assert.match(sql,/a\.role COLLATE utf8mb4_unicode_ci=m\.role COLLATE utf8mb4_unicode_ci/);
 assert.match(sql,/JOIN users u ON u\.id=m\.user_id AND u\.status='active'/);
 assert.match(sql,/m\.role='driver' AND m\.status='active'/);
 assert.match(sql,/e\.tenant_id=\? AND e\.branch_id=\?/);
 assert.match(sql,/e\.kind='employee' AND e\.archived=FALSE AND e\.status='active'/);
 assert.match(sql,/JSON_UNQUOTE\(JSON_EXTRACT\(e\.data,'\$\.role'\)\)='driver'/);
 assert.match(sql,/NOT EXISTS[\s\S]*customer\.role='customer'/);
 assert.match(sql,/NOT EXISTS \(SELECT 1 FROM tenant_customers tc/);
 assert.match(sql,/NOT EXISTS \(SELECT 1 FROM platform_admins pa/);
 assert.match(sql,/FOR UPDATE/);
};

test('lists only SQL-eligible driver records with scoped tenant/branch parameters',async()=>{
 const {db,calls}=mock([{id:employee},{id:'employee-b'}]);
 assert.deepEqual(await activeDeliveryDriverIds(db,tenant,branch),[employee,'employee-b']);
 assert.deepEqual(calls[0].params,[branch,tenant,branch]);
 checkScope(calls[0].sql);
 assert.match(calls[0].sql,/ORDER BY e\.id FOR UPDATE$/);
});

test('does not fall back to an unverified driver when none qualify',async()=>{
 const {db}=mock([]);
 assert.deepEqual(await activeDeliveryDriverIds(db,tenant,branch),[]);
});

test('driver completion checks actor and assigned employee in the same scoped query',async()=>{
 const {db,calls}=mock([{id:employee}]);
 assert.equal(await assignedActiveDeliveryDriver(db,tenant,branch,user,employee),true);
 assert.deepEqual(calls[0].params,[branch,tenant,branch,user,employee]);
 checkScope(calls[0].sql);
 assert.match(calls[0].sql,/JSON_UNQUOTE\(JSON_EXTRACT\(e\.data,'\$\.userId'\)\)=\? AND e\.id=\? LIMIT 1 FOR UPDATE$/);
});

test('rejects driver completion when the scoped SQL returns no eligible identity',async()=>{
 const {db}=mock([]);
 assert.equal(await assignedActiveDeliveryDriver(db,tenant,branch,user,employee),false);
});

test('rejects missing actor or assigned driver before querying the database',async()=>{
 const {db,calls}=mock([{id:employee}]);
 assert.equal(await assignedActiveDeliveryDriver(db,tenant,branch,'',employee),false);
 assert.equal(await assignedActiveDeliveryDriver(db,tenant,branch,user,''),false);
 assert.equal(calls.length,0);
});

test('rejects ambiguous duplicate matches rather than authorizing completion',async()=>{
 const {db}=mock([{id:employee},{id:employee}]);
 assert.equal(await assignedActiveDeliveryDriver(db,tenant,branch,user,employee),false);
});

test('driver order reads require one active matching employee in the scoped branch',async()=>{
 const {db,calls}=mock([{id:employee}]);
 assert.equal(await activeDeliveryDriverEmployeeId(db,tenant,branch,user),employee);
 assert.deepEqual(calls[0].params,[branch,tenant,branch,user]);
 assert.match(calls[0].sql,/a\.role COLLATE utf8mb4_unicode_ci=m\.role COLLATE utf8mb4_unicode_ci/);
 assert.match(calls[0].sql,/JOIN users u ON u\.id=m\.user_id AND u\.status='active'/);
 assert.match(calls[0].sql,/JSON_UNQUOTE\(JSON_EXTRACT\(e\.data,'\$\.userId'\)\)=\? LIMIT 2$/);
});

test('driver order reads reject no match or ambiguous duplicate matches',async()=>{
 const none=mock([]),duplicate=mock([{id:employee},{id:employee}]);
 assert.equal(await activeDeliveryDriverEmployeeId(none.db,tenant,branch,user),null);
 assert.equal(await activeDeliveryDriverEmployeeId(duplicate.db,tenant,branch,user),null);
});

test('driver order reads reject missing user before any query',async()=>{
 const {db,calls}=mock([{id:employee}]);
 assert.equal(await activeDeliveryDriverEmployeeId(db,tenant,branch,''),null);
 assert.equal(calls.length,0);
});
