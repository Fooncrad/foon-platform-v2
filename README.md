# FOON Platform V2

Clean rebuild of the FOON multi-tenant commerce and restaurant platform.

## Principles
- New codebase and new database foundation
- Production-first architecture
- Arabic / English / French
- RTL / LTR
- Mobile-first responsive UI
- Strict tenant isolation
- Unified authentication, sessions and roles
- Separate public menu, customer, restaurant/store and super-admin surfaces

## Production branch
`production`

## Stack
- Next.js 16
- TypeScript
- Node.js 24
- pnpm
- MySQL

## Registration and administration
- `/register` creates the owner, active store, main branch, owner membership and active free subscription atomically. No administrator approval is required.
- `/<store-slug>/register` creates a customer and records their source store in `tenant_customers`. It creates no store, subscription or employee membership.
- Administrator store creation requires an existing active owner and uses the same free subscription provisioning. The store list shows its plan and subscription status.
- Migration `0018` seeds the free catalog, assigns it only where subscriptions are missing and releases legacy pending stores with active owners. Existing subscriptions and suspended stores are preserved. Migration `0019` adds store customer relationships.
- Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, and the unit-test scripts. Integration and browser checks require the dedicated local `foon_migration_test` database. Apply migrations with `DATABASE_URL` set and `npm run db:migrate` before enabling new routes.
- CI validates migrations against disposable MariaDB, including replay, free activation, customer isolation and rollback. Production deployment and production migrations require separate verification; a passing build is not deployment evidence.

## Restaurant command center
The dashboard adapts the shell and restaurant command center from [Fooncrad/nfood-saas-v2](https://github.com/Fooncrad/nfood-saas-v2): navy sidebar, topbar, branch/restaurant selection, module search, operational summary, sales, branches, orders and responsive navigation. Reference demonstration values are replaced with stored FOON data.

Migration `0020_restaurant_operations.sql` adds tenant-scoped operational resources, orders, immutable line-item price snapshots, image assets and audit events. Apply it before deploying the restaurant operations routes.

- Menu categories/items, tables, inventory, suppliers, purchases, employees/attendance, coupons/campaign drafts, reservations/waitlist, remote tasks/workers/messages/deliveries, branch settings and storefront branding have persisted create/edit/archive flows.
- POS and customer ordering calculate prices and coupon discounts on the server. Request keys prevent duplicate orders after a retry. Order-state transitions, manual payment/refund records and kitchen access are controlled by tenant roles.
- Receiving a purchase updates inventory atomically; received purchase quantities are immutable. Record versions protect concurrent changes. Staff linking requires an existing active account; managers cannot promote or suspend managers or owners.
- Storefront image uploads accept PNG/JPEG/WebP up to 2 MB per image with a 50 MB tenant storage cap. Public menus use saved branding and available menu items. Customer orders are tied to their store/customer relationship.
- Reports use stored paid orders, including branch and product totals. Session management exposes no token hashes and can revoke only the signed-in user's other sessions. Background dashboard reads do not extend the super-admin inactivity timeout.
- Electronic payment processing, external campaign delivery, payroll transfers and two-factor authentication are not enabled by these operational forms. Campaign schedules are saved drafts awaiting a connected provider/worker; recorded manual payments do not charge a gateway.

CI runs `test:resources`, `test:operations` and `test:browser` with a disposable MariaDB and Chromium. The browser journey creates a menu item, records a POS sale, checks navigation/search and captures desktop/mobile screenshots. No preview-only route or fixture data is deployed.
