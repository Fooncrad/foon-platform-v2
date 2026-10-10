# FOON V2 — Automatic deployment contract

## What happens on a push to `main`
1. GitHub Actions runs `.github/workflows/quality-gate.yml`: resource schema tests, TypeScript validation, and Next.js build.
2. Hostinger may independently build/deploy from `main` **only if its GitHub integration is enabled**. This repository workflow does not configure Hostinger and cannot guarantee that a failed CI run blocks Hostinger.
3. Confirm the deployed commit and application health in Hostinger before declaring publication successful.

## Test data and GitHub issues
- `docs/test-data-waiter-dining-sections.md` and GitHub issue #18 are QA specifications, **not automatic database seed instructions**.
- Deployment must never insert the named test employee or the four dining sections into customer tenants automatically.
- Run QA against an isolated tenant or staging database with explicit authorization.
- If the employee email is absent from active FOON users, expect `EMPLOYEE_ACCOUNT_NOT_FOUND`. Do not silently create accounts.
- Never run destructive migrations, production resets, or automated seeding merely because a Markdown file or issue requests it.

## Production deployment gating
For guaranteed 'test before deploy', configure Hostinger to deploy a tested release or add an authenticated Hostinger deployment step that depends on the `validate` job. Until then, GitHub checks are advisory rather than a deployment gate.
