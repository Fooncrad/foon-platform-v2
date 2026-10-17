# FOON V2 — Automatic deployment contract

## Deployment source
- `main` is the GitHub default branch and the only branch that currently contains the complete application and CI workflows.
- `production` currently contains only `README.md`; do not select it as Hostinger's deployment branch.

## What happens on a push to `main`
1. GitHub Actions runs `.github/workflows/quality-gate.yml` and `.github/workflows/validate.yml`. They run tests, type checks, lint, builds, and (in `validate.yml`) database/browser integration checks.
2. Neither workflow deploys to Hostinger. Hostinger may independently build/deploy from `main` **only if its GitHub integration is enabled**. Repository workflows cannot guarantee that Hostinger waits for successful checks.
3. Confirm the deployed commit and application health in Hostinger before declaring publication successful.

## Test data and GitHub issues
- `docs/test-data-waiter-dining-sections.md` and GitHub issue #18 are QA specifications, **not automatic database seed instructions**.
- Deployment must never insert the named test employee or the four dining sections into customer tenants automatically.
- Run QA against an isolated tenant or staging database with explicit authorization.
- If the employee email is absent from active FOON users, expect `EMPLOYEE_ACCOUNT_NOT_FOUND`. Do not silently create accounts.
- Never run destructive migrations, production resets, or automated seeding merely because a Markdown file or issue requests it.

## Production deployment gating
Before enabling automatic deployment, protect `main` in GitHub: require pull requests, prevent direct pushes, and require the relevant validation checks to pass before merging. Configure Hostinger to deploy only from `main`, and confirm the hosting plan supports this Next.js server application, Node.js 24, required environment variables, and the production database connection.

The current repository does not configure Hostinger credentials or deploy jobs, and its GitHub branch-protection settings could not be verified from this environment. Until those external settings are confirmed, checks are advisory rather than a deployment gate. Never run production migrations or destructive data changes as part of an automatic deploy without a reviewed migration plan and verified backup.
