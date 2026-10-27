import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveOperationsBranchSelection } from '../lib/restaurant/operations-branch-selection.ts';

test('same header and query use the same branch for PIN and reads', () => {
  assert.deepEqual(resolveOperationsBranchSelection('branch-a', 'branch-a'), { branch: 'branch-a', conflict: false });
});

test('conflicting selectors cannot select an unlocked branch for PIN and another for reads', () => {
  assert.deepEqual(resolveOperationsBranchSelection('branch-a', 'branch-b'), { branch: 'branch-b', conflict: true });
});

test('empty query must not turn a scoped header into an all-branch read', () => {
  assert.deepEqual(resolveOperationsBranchSelection('branch-a', ''), { branch: 'branch-a', conflict: false });
});

test('empty header must not bypass a protected query branch', () => {
  assert.deepEqual(resolveOperationsBranchSelection('', 'branch-b'), { branch: 'branch-b', conflict: false });
});

test('whitespace-only selectors behave as missing, not as a branch', () => {
  assert.deepEqual(resolveOperationsBranchSelection('   ', ' branch-b '), { branch: 'branch-b', conflict: false });
});

test('a query-only selection is enforced consistently', () => {
  assert.deepEqual(resolveOperationsBranchSelection(null, 'branch-b'), { branch: 'branch-b', conflict: false });
});

test('a header-only selection is enforced consistently', () => {
  assert.deepEqual(resolveOperationsBranchSelection('branch-a', null), { branch: 'branch-a', conflict: false });
});

test('no selection remains tenant-scoped only when no branch is selected', () => {
  assert.deepEqual(resolveOperationsBranchSelection(null, null), { branch: null, conflict: false });
});

test('whitespace trimming never permits two different non-empty branches', () => {
  assert.deepEqual(resolveOperationsBranchSelection(' branch-a ', 'branch-b'), { branch: 'branch-b', conflict: true });
});
