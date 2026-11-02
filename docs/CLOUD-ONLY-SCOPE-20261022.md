# FOON V2 cloud-only continuation

This branch continues the Next.js SaaS from main and includes the admin provisioning fixes from PR #202.

## Scope
- Platform administration, restaurant/store registration, activity profiles, country/currency, branch isolation, subscriptions, customer site and responsive public menu.
- No `apps/windows`, Windows Electron/NSIS installer, W27-W31 desktop station, desktop-sync worker or migration `0156_desktop_sync_outbox.sql` from PR #203/#205 is included.
- **Do not merge desktop PR #203, #204, or #205 into this branch.**
- No production deployment or SQL migrations were executed by creating this branch.

## Cloud features to preserve
The existing main branch already includes browser offline menu/PWA, offline POS browser features and server Edge APIs/migrations 0073 and 0075. These are cloud-system capabilities and are **not** automatically removed or disabled because they support existing integrations. Removal needs dependency and live-client audit; deleting them by filename risks breaking the website. No Windows desktop synchronization is activated by this branch.

## Release checks
Run `npm ci`, `npm run typecheck`, `npm run build`, and `npm run test:admin-provision`, then role, activity, menu, checkout, email, and API integration tests before manually merging to main.
