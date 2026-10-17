# FOON V2 — Activity-scoped plans and public service request lifecycle (2026-10-17)

## Scope
This change fixes package-feature relevance for all 15 business activities, service/product catalog limits, public service listings, and a new **customer-to-merchant service request** lifecycle. No production DB migration, deployment or actual payment is performed here. Existing paid subscriptions and administrator custom overrides are preserved.

## Capabilities and package boundaries
- Restaurant and café: dining, waiter, kitchen, tables, restaurant reservations and split-bill features.
- Retail: product catalog and its existing `digital_menu` limit, plus variants where supported.
- Car wash, laundry, automotive, salon and public works: the `catalog` grant controls service catalog creation/CSV/images and the existing per-category and per-item quota. Physical products do not receive service-request buttons.
- Automotive can also have stock, purchases/suppliers and appointments, subject to its own plan and permissions; car wash and salon support appointments; public works offers **quotation inquiries**, not automatically generated price offers.
- Common merchant features such as storefront, POS, delivery and accounting remain subject to their existing plan grants. Creator-only account features do not appear in merchant feature editing. Unknown historical activity profiles keep legacy behavior.
- Free plans can accept **inquiries** under their existing service catalog grant; requesting an appointment requires the `appointments` grant. Formal quotation generation remains controlled separately.
- Shared plan settings and preexisting saved activity overrides are not deleted or rewritten. Only the relevant features are shown in each activity selector. Numeric limit editors appear only for actual enforced catalog keys; limits on other keys should not be advertised as enforced until implemented.

## Customer service request workflow
- On the published `/{slug}` storefront, active catalog entries of `product_type='service'` can offer an **inquiry**, **appointment request** or **quotation inquiry** as applicable. The label never asserts confirmation.
- Customers must sign in (or register), and their account must be joined to that business. Staff/employee accounts are explicitly rejected, including suspended employment.
- `POST /api/customer/service-requests` verifies membership, active tenant/branch, active service and category, capability/plan, contact details and requested appointment window. It uses the customer's own authenticated identity, an idempotency key, a tenant-scoped unique lookup, an audit trail and rate limiting.
- `GET /api/customer/service-requests` reads **only the authenticated customer's** own service request history within the selected business. It never exposes another customer's requests.
- Requests are stored as `service_customer_request` resources within the existing tenant-scoped `restaurant_resources` table; there is **no new schema migration**.
- The merchant service catalog presents a request inbox even in plans where formal quotation management is unavailable. `GET/PATCH /api/restaurant/service-requests` is owner/manager-only, scoped by tenant, with optimistic version checks, allowed transitions and audit history.
- Status transitions:
  - Appointments: pending → in_review/confirmed/declined; confirmed → completed/cancelled.
  - Inquiries/quote requests: pending → in_review/responded/declined; no implicit confirmation of a priced quotation.
  - Customers can submit requests but cannot update merchant-controlled statuses.
- Customers receive in-account status notifications with Arabic/English/French copy. Email queues depend on actual mail setup and delivery workers, which are **not verified** here.
- Pending or in-review requests appear in the merchant menu attention count, not in restaurant waiter/table queues.
- A merchant phone link remains as a secondary way to inquire.

## Verification
- 228 programmatic pure-policy assertions on the actual service-request policy source and localized notification source passed in an isolated JavaScript environment.
- A new reproducible Node test file is provided: `node --experimental-strip-types --test scripts/service-request-policy.test.mjs`.
- Static cross-file checks are part of the review. These do not validate database transaction semantics or a production build.
- **Still required outside GitHub Actions before approving the draft PR:** `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, new service-policy tests, existing activity tests, local MariaDB integration and real customer/merchant browser journeys in Arabic/English/French at 320px.
- Test repeat-key collisions, cross-tenant service IDs, expired appointments, disabled plan grants, suspended employee accounts, free and paid activity quotas, branch filtering, updates and customer notifications. Check that restaurant ordering and retailer catalogs remain unchanged.
- Confirm `schema_migrations` includes 0092/0093 and take a production backup before manually merging/deploying.

## Open work / explicit limits
- Request submission is **not** a resource-capacity availability engine or a confirmed appointment. Manager confirmation changes request status only; calendar collision and staff allocation are not implemented.
- Quotation inquiry is **not** a formal priced quotation, deposit, payment link, accepted estimate or invoice. Conversion to a formal merchant quotation still needs a dedicated audited workflow.
- Sending the request does not guarantee SMS, WhatsApp, email or an instant merchant audio notification; email delivery and live push are unverified.
- Full scheduled service booking, vehicle details (plate/model), assignment, slot availability, advanced appointment cancellation, service-specific inventory lines, merchant push, and all non-catalog numeric feature quotas remain further work.

**Release status: DRAFT — no automatic merge or publish.**
