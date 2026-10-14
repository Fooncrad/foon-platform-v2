# FOON V2 — Activity creation integration checkpoint

Status: **OPEN — not ready for final gap consolidation**. This is a source-code inventory, not a successful production or browser test.

## Evidence on the test branch

| Stage | Source | Evidence | Outstanding verification |
| --- | --- | --- | --- |
| 14 activity presets | `lib/platform/activity-presets.ts` | Modules are defined per activity, with ar/en/fr module labels | Run `npm run test:activities`; validate permissions against actual tenants |
| Activity storefront templates | `lib/platform/activity-templates.ts` | At least one template key for each preset | Browser-test storefront rendering for every key |
| Product/service catalog | `app/api/restaurant/activity-catalog/route.ts` and `app/restaurant/activity-catalog-editor.tsx` | Tenant-scoped category/product API and editor exist | Exercise create/edit/list for each activity with migrated test DB |
| Storefront template editor | `app/api/restaurant/activity-template/route.ts` and `app/restaurant/activity-template-editor.tsx` | Tenant-scoped template read/save and preview link exist | Verify save/preview/render; translate editor UI ar/en/fr |
| Merchant workspace | `app/restaurant/page.tsx` | Loads activity-specific modules for recognized codes | Test role, plan and activity combinations, especially unknown/legacy activity codes |
| Financial flow | `lib/restaurant/tax-calculation.ts` | Pure tax helper exists on test branch | Connect to order, payment and invoice persistence and run end-to-end tests |
| Kitchen ticket | `lib/restaurant/print-notes.ts` | Note formatting helper exists | Wire to kitchen print and test visibility by receipt type |
| CI | GitHub Actions for this test branch | No runs returned at checkpoint | Run Node 24 tests, typecheck, lint, build and DB integration checks |

## Definition of the collection point

Do **not** mark creation complete until each activity can be registered, has a usable dashboard and catalog/service workflow, has a working public storefront in all three languages, and passes authorized API/browser checks. Once those are evidenced, collect remaining restaurant/cafe and cross-activity issues in one prioritized backlog.

## Safe test links

- Branch: https://github.com/Fooncrad/foon-platform-v2/tree/test/foon-v2-completion-20261014
- Activity tests: https://github.com/Fooncrad/foon-platform-v2/blob/test/foon-v2-completion-20261014/scripts/activity-coverage.test.mjs
- GitHub Actions: https://github.com/Fooncrad/foon-platform-v2/actions
- Activity catalog API source: https://github.com/Fooncrad/foon-platform-v2/blob/test/foon-v2-completion-20261014/app/api/restaurant/activity-catalog/route.ts
- Template API source: https://github.com/Fooncrad/foon-platform-v2/blob/test/foon-v2-completion-20261014/app/api/restaurant/activity-template/route.ts
