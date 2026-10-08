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
- Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, and `node --test scripts/*.test.mjs` (the integration test requires a disposable local `foon_migration_test` database). Apply migrations with `DATABASE_URL` set and `npm run db:migrate` before enabling the new registration flows.
- CI validates migrations against disposable MariaDB, including replay, free activation, customer isolation and rollback. Production deployment and production migrations require separate verification; a passing build is not deployment evidence.
