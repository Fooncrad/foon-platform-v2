# Mobile stability follow-up — 26 October 2026

Base: `e92d6d9326c63c8e6f2bfcca05bb52c6630e0e4c` (latest main at checkout).
Inspected merged PRs #338, #339, #340 and recent open PRs. Preserve #338's
customer floor-map canvas and internal scrolling; do not duplicate it.

## Confirmed cause and changes

The reservation month view rendered seven shrinking columns and hid guest names
below 600px. Clipping the document cannot make those cells readable. A focusable,
labelled scroll region now owns an 840px month grid below 900px. Guest names wrap
and remain visible; week/day views keep their existing layout.

Horizontal rails now have zero automatic minimum inline size, so nested grid/flex
layouts can shrink their scroll owner. Native service, QR, product, reservation
and confirmation dialogs get mobile viewport bounds and vertical scrolling.
The merchant search overlay starts near the top on short mobile screens.

No business services, payment code, permission checks, SQL or migrations changed.

## Browser coverage

`npm run test:mobile-layout` runs:

- Public landing/login/register/market at 320/375/390/430/768px in ar/en/fr.
  It asserts language/direction, successful responses, document width and actual
  element bounds, including fixed/absolute elements. Intentional internal rails
  remain exempt for their contents, not their own viewport.
- Isolated production-CSS rendering at those sizes/languages and 480px height:
  calendar/table/category rails across merchant/admin/customer/menu/store shells;
  scroll movement in RTL/LTR; guest name visibility; four dialog families with
  long identifiers and tall content; reachable close controls and page width.
  These are layout contract tests, not authenticated React/DB journeys.
- Login input font/visibility guard.
- Explicit skipped coverage marker when disposable authenticated sessions are
  missing. Redirecting a protected route to login never counts as coverage.

Optional real store: `FOON_MOBILE_STORE_SLUG=<disposable-store-slug>` visits the
canonical `/<slug>` route (the former `/menu/<slug>` was not an app route).

For authenticated layouts, set `FOON_MOBILE_AUTH_SURFACES` to a JSON array of four
objects, with names `customer`, `merchant`, `staff`, `admin`. Each object supplies
`path` (actual relative route), `root` (unique shell selector), and `storageState`
(Playwright session file outside the repository). Staff and merchant may share
the restaurant shell but must have different appropriately scoped sessions.
The matrix asserts the final URL and rendered root, not a login redirect.
Use only disposable local/staging accounts and a local test database. Session
files contain credentials: never commit them. Existing DB browser integration
remains in `npm run test:browser` and requires `foon_migration_test`.

## Local evidence

- Node 26.8.2, Chromium, Windows.
- `npm run typecheck`: passed.
- `npm run build`: passed after retrying a local filesystem permission failure.
- Focused Node tests: 18 passed (viewport/responsive/customer navigation/floor visuals).
- Public route + layout suite: 31 passed, 1 explicitly skipped authenticated marker.
- Regression proof: isolated calendar test with original main CSS fails at 320px
  because the calendar does not offer internal horizontal scrolling; patched
  production styles pass the matrix.

No local MariaDB runtime or disposable authenticated sessions were available.
Real protected pages, tenant-specific catalogs, booking submission, employee/admin
journeys and native iOS Safari remain required review checks; these results do
not establish that every page or every merchant configuration has been tested.
No merge or deployment performed. Manual review and merge only.

## Authenticated CI follow-up

All eight checks on commit `44de35d2` completed successfully. That success did
not supply the missing four authenticated sessions to the optional matrix.

`npm run test:mobile-authenticated` now supplies a separate self-contained
15-case browser matrix. The validation workflow enables it with
`FOON_MOBILE_SEED_FIXTURES=1` after existing database/browser checks. Before any
fixture mutation, the suite requires DATABASE_URL host `127.0.0.1` and database
`foon_migration_test`. Without explicit opt-in it skips. It never targets an
external base URL or writes session credentials to disk.

The suite creates temporary restaurant and grocery tenants via registration,
adds sample catalog data, registers a customer, and creates separate synthetic
waiter/admin test users in that disposable database. It exercises actual
merchant, waiter, retailer, customer and admin pages plus populated public menu
and grocery storefront, including merchant search focus/Escape, admin mobile
drawer and customer booking-dialog visibility/Escape. These fixtures do not
change production permissions or application authorization code. CI discards
the entire service database after the job, as with existing integration tests.

Local checks for this follow-up cover syntax, lint and test discovery/skip
behavior. Actual DB-backed results must be read from the follow-up commit's
validation job; the earlier green commit is not evidence for the new suite.

The first follow-up CI attempt (`e6aa2d73`) passed seven checks, but the browser
job timed out installing OS font packages from Ubuntu 26.04's mirror before
any browser suite ran. The database/browser job now pins Ubuntu 24.04 and bounds
browser installation to four minutes while retaining all dependencies and
assertions. The authenticated matrix also visits the real reservation calendar
and verifies focus and actual internal scrolling (120 page visits total).
