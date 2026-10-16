# Customer carts and service journeys

Customer checkout is separate from the shared staff POS. Staff POS remains available according to existing activity, plan and role grants.

| Activity | Customer journey |
| --- | --- |
| Restaurant, café, sweets/bakery | Product cart |
| Grocery, clothing, perfume, accessories, watches, gifts, ecommerce | Product cart |
| Laundry | Service basket with quantities, branch drop-off or collection/delivery |
| Car wash, salon, automotive | Service appointment/order rather than a generic shopping cart |
| Public works | Quote/project request rather than a generic shopping cart |

The new catalog cart supports option groups, quantities, a compatible branch, inline customer authentication and account linking, public catalog pagination, and currency display. Server order creation remains authoritative for price, stock, options, branch ownership and idempotency. Orders are unpaid; this change does not execute an online payment.

Only activities with an enabled orders entitlement expose the catalog cart. The public metadata endpoint scopes each product/category/branch/options lookup to its published store. The customer order endpoint rejects generic-cart submissions for appointment/quote activities. Legacy restaurants retain their existing menu cart.

The browser session retains public item/option snapshots and quantities per store. Contact information is not stored in these cart drafts. A retry key and a hash of the request are retained for uncertain network outcomes. A signed-in customer's own phone and most recent collection/delivery address can prefill checkout; submitted delivery contact details are validated server-side. Delivery address notes are masked from kitchen responses.

## Remaining scope

The appointment/quote classifications do not claim that the wider public booking/quote flows are complete. Actual service scheduling, pickup windows, delivery regions/fees, saved-address management, provider payments/refunds, loyalty and real-device offline acceptance remain in issue #32. Laundry quantities here are priced catalog units; weight-based final pricing and collection scheduling require separate workflows. Café dine-in table selection is not added to the generic catalog cart by this change.
