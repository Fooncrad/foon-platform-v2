# FOON V2 — Security / functionality hotfix review (2026-10-21)

## Scope implemented on this branch
- Staff dashboard menu now checks role policy AND explicit grants; merchant-only sections do not accept aliased staff grants.
- Generic operations customers and health APIs are manager-only; branch-list GET returns only assigned branches to staff.
- Employee onboarding requires a 9+ character password; email invitations/acceptance are disabled with HTTP 410. New users are activated when provisioning commits successfully, not just after saving a suspended resource profile.
- Existing employee password resets require the privileged staff-provisioning PATCH, update only a linked non-owner/non-manager account and create an audit event.
- Existing customers/accounts are not silently repurposed as staff by email. Ordinary employee creation cannot grant manager authority.
- Hotel-room entry requires selecting a valid branch.
- Additional-branch PIN: scrypt-salted hash; session-bound 15-minute unlock; 5 failed attempts lock the session for 15 minutes. Primary branch stays exempt. Generic restaurant operations, branch management, and employee provisioning enforce the gate.

## Rollout blockers — DO NOT MERGE OR PUBLISH YET
1. **Migration 0150** must be reviewed against real schema state and applied to an isolated staging copy first. Back up before production migration. Existing additional branches are locked until owner sets their initial PIN.
2. **Broader API audit is required.** Branch-specific routes outside /api/restaurant/operations (including catalog editing, staff-help, service, payment, and independent administration APIs) must also enforce the same PIN server-side. This branch does NOT yet provide complete coverage of every branch action.
3. Run locally (not GitHub Actions): `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test:resources`, `npm run test:operations`, `npm run build`; run browser tests against a staging DB.
4. Regression tests: anonymous access must fail; employees with no grants must see only their task landing and must get 403 for admin modules and other branches; staff with correct role/grant but no branch assignment must be rejected. Test that POST with a different body branch cannot bypass PIN, PIN is session-bound, PIN retries expire correctly, owner-only PIN setup and rotation, and legacy branch PIN migration.
5. Exercise create/edit/delete hotel rooms across two branches; create staff with password, edit grants, reset password, sign in, change staff branch and verify old grants/assignments are gone, and confirm old invitation links return 410. Validate email collision fails safely without taking over another account.
6. Customer GPS geocoding needs `GOOGLE_MAPS_GEOCODING_API_KEY` configured server-side and Geocoding API enabled; manual address entry remains supported. Test location permission, provider unavailability, same-country and denied cross-country delivery, and order address persistence. Do not remove country isolation.
7. Hostinger deployment/health and real browser verification have **not** been performed from this connection. Do not claim live site is fixed.

## Safety
- No direct writes to Hostinger production or production customer data were made during this branch work.
- CI is not an acceptable substitute for local test/build in this project.
