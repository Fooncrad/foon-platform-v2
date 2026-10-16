# Order checkout charges

Migration `0091_order_checkout_snapshot.sql` adds one nullable JSON column. Apply it before the new server version, using the production backup/review procedure. Historical orders retain NULL; no historical totals are recalculated. Code rollback does not require dropping the column.

Owner/manager storefront settings define the store-level VAT rate, whether saved item prices include VAT, a fixed service fee per order and a delivery fee charged only for `delivery`. Fee taxation and fee-inclusive/exclusive entry are separate explicit settings. An unconfigured store preserves its existing totals.

The server prices saved items/options, rounds each measured line to currency cents, applies the coupon to goods, splits goods VAT according to inclusive/exclusive mode, and adds fees with their configured tax treatment. Fees are not coupon-discounted. A 100 exclusive price with 10 discount and 15% VAT is 103.50; untaxed 5 service + 10 delivery gives 118.50. Stored `subtotal`/`discount` retain their existing semantics; `total` is the final payable amount. The snapshot records net, tax, fees, policy and seller identity at creation, and is never updated by status/payment changes or by later settings changes. Request replay returns the original order/total.

The POS and public carts show an estimate before coupon validation. The server remains authoritative. Cached POS policy is only a preview and may be stale until reconnect; offline queued orders remain unpaid until server confirmation. The legacy LAN gateway returns `EDGE_CHARGES_NOT_SUPPORTED` instead of silently skipping configured charges.

The final paid-order payment receipt shows saved seller identity, persisted line prices, subtotal, discount, fees, net, tax and total. Its QR is generated locally and encodes only a payment-receipt reference, amounts and currency. It is not a ZATCA fiscal QR, signed invoice or claim of regulatory certification. Item-specific VAT/excise rates, service quotation/internal-invoice workflows, fiscal clearance and automatic invoice-archive issuance are outside this change. Existing receipt wording remains explicit.

Validation: `npm run test:checkout`; with a disposable loopback-only `foon_migration_test` database and built Next app, `npm run test:checkout:integration`. Tests create isolated randomized tenants and never accept a production database URL.
