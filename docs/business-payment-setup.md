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
Tap test checkout can be enabled from each merchant's dashboard after completing keys and configuring HTTPS APP_URL. Customers use the test payment button beside their own orders at /customer. Migration 0085 and earlier migrations are required. Branch overrides are explicit; disabled overrides block inherited checkout. Test callbacks never mark orders paid.

Live collection and other providers are not enabled. See [Tap checkout](tap-hosted-checkout.md) for durable initiation, safe retry and remaining recovery work. Cash collection is confirmed in the orders workspace.
