# FOON V2 — manual merge and production release review
Reviewed: 2026-10-26 (Asia/Riyadh). Status: HOLD — not production authorization.

## Verified repository snapshot
- main: 17d3806ca9e2d99e78c6a7c630fce528a7cb542c (verified via GitHub compare on 2026-10-26). #309, #312, #313 and #314 have been merged; none was merged by this review.
- production: 9a0a5ac29550c84c7128d81432efcbcce17308ad, initial commit. README names production, but actual Hostinger source branch and deployed SHA are unverified. Do not promote main into production based on the branch name.
- Both branch endpoints report protected=false. Repository rulesets and Hostinger controls were not established by this review; retain human gates.
- Historical main Validate run https://github.com/Fooncrad/foon-platform-v2/actions/runs/40246434570 succeeded on an **earlier** main SHA, as did Quality Gate 40246434578 and Verify 40246434645. Those runs do **not** certify the new main SHA 17d3806. #314's final head 51083f8c had 6/6 completed successful workflows before merge.
- This is CI evidence, not a new local test run, live database inspection or proof of deployment. Earlier reports of 49 tests/local runner authentication are historical and do not certify this snapshot.

## Current relevant PRs (updated 2026-10-26)
| PR | Current state / reviewed head | Evidence / release treatment |
| --- | --- | --- |
| #311 | Open draft, 00a22dc0ce78588438a73374d4b93f0a1ddd3a6b | Five of six prior workflows failed because `floor-plan-editor.css` was missing. Added the missing scoped responsive stylesheet to the **same branch**; new CI is in progress (Edge Storage succeeded when last checked). Keep branch-load and pending-save protections, verify browser behavior, and combine with #316 deliberately. No SQL in #311. |
| #316 | Open, 5594d4730f8759d3196223a128851cc6f62218b6 | New multi-section layouts and **0306** migration. Fixed POST/PUT oversized-body response to `413 BODY_TOO_LARGE` and added a regression test; latest CI is in progress (Edge Storage succeeded when last checked). New UI remains Arabic-only and needs AR/EN/FR coverage, stale-save/branch-switch checks, and integration with #311. **Do not enable routes before approved 0306 migration.** |
| #312 | Merged, 2cd1ef65f3d3de02b24e8055f3d54ed783f89e84 | Added 0305 booking policy schema. Paid table booking remains intentionally disabled pending real payment and availability integration. Merged does not prove migration applied on live DB. |
| #313 | Merged, beea32dd6080bc33b243a75138f444d7fc68e147 | Table placement helper in main. Preserve `nextFloorTablePosition` when integrating #311 and #316. |
| #314 | Merged, 51083f8c626b1e472c588339058aa15b7c787d6b | Receipt/location JSON body bounds. Final head had six successful workflows; earlier lint failure at e34dd9bd is **superseded**, not a current blocker. |
| #315 | Open draft, this documentation | Review plan only, not deployment authorization. |

Other open security, POS, customer, analytics and Windows/sync PRs remain separate. Do not batch-merge or duplicate their changes. #227's measured-product browser journey still fails; #236/#269/#270/#244/#253 have merge conflicts and overlapping files. These require independent review.

## Migration compatibility findings
- main includes migrations/0304_restaurant_floor_plans.sql: additive CREATE TABLE IF NOT EXISTS, tenant/branch composite primary key, JSON layout.
- main now contains #312's migrations/0305_restaurant_floor_booking_policies.sql (policy defaults disabled); #316 separately proposes 0306_restaurant_floor_plan_layouts.sql for named layouts, not yet merged.
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
6. Preserve merged #313 placement logic and #312 policy safeguards while integrating #311 and #316 (shared merchant-dashboard.tsx). Confirm 0306 is included only after isolated DB migration tests and manual approval. #314 is already merged; do not reapply its changes. Keep paid booking activation and Windows sync out of scope without separate approval. Recheck current main and all selected heads; require CI on the final combined commit.
7. Present exact PRs, final commit, migration list, backup/restore evidence, outage/write-control plan and rollback plan for explicit human approval. Manual merge is distinct from production release approval. Do not merge this documentation PR or any feature automatically.
8. After separate explicit production approval only: perform the reviewed release sequence and schema-before-route ordering, then check health, login, tenant isolation, orders, receipts and logs. Record deployed SHA and migration ledger. On failure, stop traffic/writes as planned; revert application only if schema-compatible. Never assume DDL rollback or restore over newer writes without a reviewed recovery decision.

## Evidence links
- main snapshot: https://github.com/Fooncrad/foon-platform-v2/commit/17d3806ca9e2d99e78c6a7c630fce528a7cb542c
- PRs: https://github.com/Fooncrad/foon-platform-v2/pull/311 ; https://github.com/Fooncrad/foon-platform-v2/pull/316 ; https://github.com/Fooncrad/foon-platform-v2/pull/312 ; https://github.com/Fooncrad/foon-platform-v2/pull/313 ; https://github.com/Fooncrad/foon-platform-v2/pull/314
- Superseded #314 lint failure (historical only): https://github.com/Fooncrad/foon-platform-v2/actions/runs/40251223967/job/121343342799

No live DB connection, production mutation, merge or deployment was performed by this review. This document is a review gate, not a claim that backup, compatibility or release acceptance is complete.
