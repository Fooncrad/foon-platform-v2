# Business payment setup — test branch
The payment editor is shared by all 14 activity types. Owners and managers may save settings; accountants may read them. Tenant-wide settings and branch overrides are isolated.

## Included
- Arabic, English and French, mobile layouts, gateway-specific public/secret/entity/webhook fields.
- Cash, Moyasar, Tap, HyperPay, Stripe and custom gateway configuration.
- Test/live selection with key-prefix checks where the provider specifies them.
- AES-256-GCM encrypted secrets, bound to tenant, scope, provider and mode.
- Empty secret inputs preserve existing credentials only for the same provider/mode; explicit removal deletes them.
- Changing provider/mode clears prior secrets; optimistic versions reject stale saves.
- Read APIs return secret-presence flags only. Audit records contain no keys.

## Platform setup
1. Apply migration 0079 on the authorized test database using npm run db:migrate.
2. Generate a 32-byte encryption key on the trusted host: node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))".
3. Add the value as FOON_PAYMENT_VAULT_KEY in the host's private runtime environment; never use a NEXT_PUBLIC variable or commit it.
4. Preserve this key in the platform's private backup process. Replacing it without re-encrypting stored data prevents decryption.
5. Restart the test application; the UI indicates whether secret storage is configured.

## Checkout status
Saving configuration does not activate online collection. Current checkout remains cash/manual only. Electronic settings are marked configured_pending_integration and cannot be enabled until provider payment creation, durable reconciliation and authenticated callbacks are implemented and tested. No webhook URL is advertised before a receiver exists. Custom gateways require an adapter.

Provider references:
- https://docs.moyasar.com/
- https://developers.tap.company/docs/get-started
- https://hyperpay.docs.oppwa.com/
- https://docs.stripe.com/keys

## Validation
npm run test:payments checks encryption, cross-scope rejection, tampering, environment checks, missing fields and activity coverage.
scripts/payment-settings.integration.test.mjs exercises the actual Next routes against disposable MariaDB, including authorization, branch isolation, stale versions, credential preservation/removal and provider changes.
.github/workflows/activity-payments-validation.yml runs these checks, typecheck, lint and build on the test branch. Passing source checks is not deployment evidence.

## Activity tools
The activity setup page and overview expose relevant tool links in three languages. Cafe presets include tables, reservations, waitlist and waiter service. Service-based businesses retain their catalog and booking navigation. Quotation integration remains explicitly pending.
