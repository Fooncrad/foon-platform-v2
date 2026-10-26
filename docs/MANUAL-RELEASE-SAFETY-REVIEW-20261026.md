# FOON V2 — manual merge and production release review
Reviewed: 2026-10-26 (Asia/Riyadh). Status: HOLD — not production authorization.

## Verified repository snapshot
- main: 539fadc3f348baad3dbaf5ac0345cc3a07c4e133; latest merge #291. #309 is already merged through 8045de0e2ec64abf22c7abcf66a8025bb0679e1a.
- production: 9a0a5ac29550c84c7128d81432efcbcce17308ad, initial commit. README names production, but actual Hostinger source branch and deployed SHA are unverified. Do not promote main into production based on the branch name.
- Both branch endpoints report protected=false. Repository rulesets and Hostinger controls were not established by this review; retain human gates.
- main Validate run https://github.com/Fooncrad/foon-platform-v2/actions/runs/40246434570 succeeded: TypeScript, lint, build, disposable MariaDB migration tests, real registration HTTP, account isolation, operations and merchant browser journeys. Quality Gate run 40246434578 and Verify run 40246434645 also succeeded.
- This is CI evidence, not a new local test run, live database inspection or proof of deployment. Earlier reports of 49 tests/local runner authentication are historical and do not certify this snapshot.

## Current relevant PRs (heads reviewed)
| PR | Head | Evidence / release treatment |
| --- | --- | --- |
| #313 | beea32dd6080bc33b243a75138f444d7fc68e147 | All 8 reported checks succeeded. Adds table placement helper and editor integration; no SQL. Review helper behavior when grid fills; current test checks source patterns rather than executing placement. |
| #311 | 1b4535ddaf55e1c8ea09c4894039a8bf5bc36a96 | All 8 checks succeeded. Draft; editor rewrite overlaps #313. Current add() does not call #313 nextFloorTablePosition helper. Integrate deliberately, preserving load/scope guards and pending-save revision protection; rerun combined tests. No new SQL. |
| #312 | 2cd1ef65f3d3de02b24e8055f3d54ed783f89e84 | All 8 checks succeeded. Draft; adds 0305 policy table, default disabled. Paid booking remains incomplete; do not enable via SQL. Defer from initial release unless independently accepted. |
| #314 | e34dd9bd9fa5ab13f1431473401477052806b4fc | Draft, blocked: Quality Gate job 121343342799 failed lint with six no-require-imports errors in scripts/merchant-receipt-location-body-security.test.cjs. TypeScript/build skipped in that job; separate Verify build passed. Some DB checks were running when observed. Fix and verify a new exact head before considering merge. |

Open PR inventory also includes customer/staff/admin hardening and extensive Windows/sync stacks (#205/#207 and descendants). They have not received a complete code audit here and must not be batch-merged. No new synchronization activation is included.

## Migration compatibility findings
- main includes migrations/0304_restaurant_floor_plans.sql: additive CREATE TABLE IF NOT EXISTS, tenant/branch composite primary key, JSON layout.
- #312 adds migrations/0305_restaurant_floor_booking_policies.sql with tenant/branch composite primary key, enabled default false and fee default zero.
- IF NOT EXISTS does not prove an existing table has compatible columns, indexes or types.
- scripts/migrate.mjs sorts all SQL filenames and applies every filename absent from schema_migrations. It also reconciles the translation seed on every run. It is not a one-file 0304 runner and has no dry-run mode.
- DDL implicitly commits in MySQL/MariaDB; rollback() cannot undo those changes. The lock prevents concurrent migration runners, not general application writes.
- Live schema_migrations, SHOW CREATE TABLE results, DB engine/version/sql_mode, pending migrations, backup inventory and restoration evidence remain unverified. Do not run db:migrate against live credentials at this stage.

## Required manual gates, in order
1. Confirm Hostinger app/domain, actual source branch, deployed commit, build/start commands, persistent uploads and any automatic deployment/migration hooks. Prevent an unintended live publish before a human merge.
2. Take an authorized consistent production database backup plus uploads/config backup using the hosting workflow. Keep secrets outside Git. Record timestamp, scope, size, checksum, retention and recovery point.
3. Restore the backup into an isolated database and confirm restore integrity, representative counts and application reads. Confirm recovery access and acceptable recovery time.
4. Obtain read-only live migration ledger and table definitions, privately. Compare against a pinned release SHA, enumerate every pending file, examine preexisting tables and verify runtime/database compatibility. Review SQL statement effects and recurring translation reconciliation.
5. On the isolated restored database, run the reviewed pending migrations, replay tests and relevant HTTP/tenant/branch authorization, billing/order and browser journeys on Node 24. Specifically test floor-plan load failures, branch switching, add/delete/add numbering and positions, and edits during save. General CI does not prove those feature-specific journeys.
6. Resolve #311/#313 overlap in a dedicated integration branch or sequentially updated PRs, with no loss of safety guards. Fix #314 separately. Keep #312 paid booking and Windows sync out of the initial scope unless separately reviewed. Recheck current main and all selected heads; require CI on the final combined commit.
7. Present exact PRs, final commit, migration list, backup/restore evidence, outage/write-control plan and rollback plan for explicit human approval. Manual merge is distinct from production release approval. Do not merge this documentation PR or any feature automatically.
8. After separate explicit production approval only: perform the reviewed release sequence and schema-before-route ordering, then check health, login, tenant isolation, orders, receipts and logs. Record deployed SHA and migration ledger. On failure, stop traffic/writes as planned; revert application only if schema-compatible. Never assume DDL rollback or restore over newer writes without a reviewed recovery decision.

## Evidence links
- main: https://github.com/Fooncrad/foon-platform-v2/commit/539fadc3f348baad3dbaf5ac0345cc3a07c4e133
- PRs: https://github.com/Fooncrad/foon-platform-v2/pull/311 ; https://github.com/Fooncrad/foon-platform-v2/pull/312 ; https://github.com/Fooncrad/foon-platform-v2/pull/313 ; https://github.com/Fooncrad/foon-platform-v2/pull/314
- Failed lint: https://github.com/Fooncrad/foon-platform-v2/actions/runs/40251223967/job/121343342799

No live DB connection, production mutation, merge or deployment was performed by this review. This document is a review gate, not a claim that backup, compatibility or release acceptance is complete.
