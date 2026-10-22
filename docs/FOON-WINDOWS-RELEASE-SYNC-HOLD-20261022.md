# FOON V2 — isolated Windows integration (2026-10-22)

## Source and scope
- Branch base: PR #203 `feat/windows-original-site-shell-20261022` (original Next.js website inside a Windows NSIS/Electron preview; order uplink/outbox; migration 0156).
- Includes PR #202 via integration PR #204 (admin activity, country, region, currency and kind provisioning; regression tests).
- Independent release-candidate branch; **not merged into main** and **not deployed**.
- Prior W27–W31 experimental branches and PR #195 Google login are **not automatically included**. They require explicit audit and conflict/security review.

## SYNC ON HOLD — do not enable
The operator has intentionally stopped synchronization while Hostinger cloud/preview redirection is diagnosed. Do not enroll or configure a cloud device, do not start a sync worker, and do not apply cloud/production migrations for this candidate. Existing local database 3307 and production data must not be modified.
- There is no fully approved automatic Windows updater in PR #203. Its cloud URL means a **POST API endpoint** at `https://<trusted-staging-host>/api/edge/sync`, **not** an installer/update download or a Hostinger preview webpage.
- Keep Windows update distribution separate from business API endpoints; refuse redirects and HTML responses for any future update manifest/package. Require signed releases/checksums, version gating and rollback design before enabling updates.
- Investigate DNS/Hostinger route/preview proxy behavior on staging without using production credentials. Confirm response status, content-type and origin for API route; never treat 200 HTML as success.
- Only consider resuming after an operator-approved staging end-to-end test validates authenticated API requests, no redirect, valid JSON and signed receipt; catalog grants, expiry, revocation, replay, conflicts and backup/restore tested; no active production users affected.

## Test and release gates
1. Clean install, `npm ci`, typecheck, lint, build and all affected security/activity tests on Windows/Node24.
2. Isolated local MariaDB apply migration 0156 (fresh fixture and existing-data rehearsal/backup); never run against Hostinger production.
3. Desktop app smoke, true installer/uninstaller and preservation of user data and DPAPI configuration.
4. Controlled staging connectivity; updater protocol and signing require implementation and dedicated tests.
5. Manual review, PR merge and staged acceptance; no automatic merges or production deployment.

## Current evidence
The owner has confirmed the full original website /api/health succeeds with `db:true`, and bootstrap admin opened locally. This does **not** prove desktop installer, production site, sync or offline acceptance.
