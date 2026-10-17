# FOON V2 — Batch 77: Admin plan integrity and missing quotations (2026-10-17)

## Verified problems in main before this branch
1. The "Create four plans" operation supplied `NULL` catalog limits and no activity overrides. When the administrator initialized plans **after** migration 0093, no later migration would bound that free plan.
2. The activity plan feature edit API accepted irrelevant activity-feature pairs even though the UI hid them.
3. `restaurant-resource-schema.mjs` uses the `quotes` grant for formal quotations **and** service orders, but the shared reference feature catalog omitted `quotes`. A plan could therefore appear entitled in tests or offer the section but fail with `PLAN_FEATURE_REQUIRED` in production.
4. Free-tier price editing accepted arbitrary positive prices; price changes lacked an atomic audit record.

## Changes
- Free plan: initial `digital_menu` and `catalog` limits 20. Seed all 15 activity defaults **only on initial creation of the free plan**, including post-0093 initializations. A later bootstrap cannot recreate a user-deleted override or overwrite a saved zero/unlimited/disabled custom override.
- Admin PUT `/api/admin/plans/[id]/features`: rejects irrelevant activity keys as `FEATURE_NOT_APPLICABLE` 422. It still allows deleting an old override to restore inheritance; shared plan features are unchanged.
- Migration `0094_quotation_plan_grants.sql`: **only additive INSERT IGNORE**. Adds `quotes` definition and default grants: Free disabled; Starter disabled; Professional enabled; Enterprise enabled. Existing non-default plans, saved grants, subscriptions, prices and activity overrides are untouched. The same mapping is used for any newly bootstrapped plans.
- Free prices remain zero on new writes; professional/enterprise prices remain independently configurable. Price saves are transactional and audit the previous and next configured values.
- Admin price editor explains the Free-tier policy and does not invite a nonzero price.

## Evidence
- Pure policy executed against current branch source: 55 independent assertions passed; 15 activity codes verified.
- Tests added: `scripts/free-plan-bootstrap-policy.test.mjs`; extended disposable-MariaDB `scripts/activity-plan-settings.integration.test.mjs` and `scripts/migrations.integration.test.mjs` for feature isolation, paid grants, idempotent replay, pricing and audit.
- **Next checks before merge:** complete Node 24 Next.js build, route and database tests against the dedicated disposable `foon_migration_test`, review relevant browser journeys, and inspect migration replay. Local runtime cannot clone GitHub due restricted DNS; do not imply those checks have run unless results are present.
- GitHub Actions are not intentionally started or retried by the assistant. Repository automation may run on pull requests. Do not confuse its results with the published Hostinger site.

## Production rollout (manual approval)
1. Back up `u284627463_clenda` and verify `0092` and `0093` already appear in `schema_migrations`.
2. Inspect the new SQL migration and confirm whether `quotes`/its plan grants already exist; migration `0094` is additive and does not rewrite them.
3. Run `0094` **once** using the approved migration runner with the correct DB connection before enabling formal quotations/service orders. If applying manually in phpMyAdmin, only record the 0094 ledger row **after both statements have succeeded**; never record the ledger first.
4. Merge reviewed branch manually, then deploy to Hostinger by existing release process; verify release SHA and production `/api/health`. Test free/professional/enterprise with an automotive account, owner/support permissions, limits 0/20/null, quotation and service-order screens, AR/EN/FR and 320px.
5. Never run destructive CI/integration suites on production and do not silently change existing paid subscriptions.

## Remaining after batch 77
- Backend limits other than catalog counts are not uniformly enforced. Feature catalog presence is **not** proof of completed operational functionality.
- Review pricing and subscription lifecycle thoroughly (start/end validation, upgrade rules, bank transfer review, multi-currency), customer verification/OAuth, service booking capacity, real payment processing and notification delivery.
- Do not claim a full cross-activity live audit until real tenant acceptance tests have been performed.

**Release state:** no merge, deployment or production migration performed by this branch.
