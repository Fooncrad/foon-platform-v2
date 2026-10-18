# Transactional notifications and interface locales

## Runtime behavior

- A single `foon_language` cookie and shared React context control Arabic, English and French across landing/authentication, public menus, customer accounts, merchant tools and platform administration. Selection also updates legacy storage keys for compatibility and the signed-in account's persisted email language.
- UI text and schema labels use `lib/i18n/ui-copy.ts`. Merchant-entered store names, product names, descriptions and notes remain merchant data; missing product translations still use the configured source content.
- Customer/owner registration creates a welcome notification. New customer orders, manual order/payment transitions, verified live gateway payment transitions, customer reservation creation and staff reservation transitions create durable in-account and email entries within the business transaction. Order replay returns before enqueueing another message.
- In-account notifications do not depend on email verification or SMTP. Existing explicit event/channel opt-outs are preserved. Default transactional channels are on when no rule has been saved.
- Verified live order payments enqueue customer notices inside the same locked transaction as settlement; duplicate callbacks and distinct events for an already-paid order do not enqueue again. Sandbox callbacks do not create a real paid notice. Dispatch runs only after webhook commit.
- Customer activity polling counts all unread notices, even beyond the 30-row preview; changes to older read receipts affect the revision. Customer activity polling includes notification revisions; read receipts update only the signed-in account. Sound requires a user click and repeats for unread notifications until acknowledgment or mute. Merchant order sound covers outstanding orders through preparation/readiness until completion/cancellation, with a mute control.
- Password reset stores its one-time token and queued email atomically, returns the same response for known/unknown accounts, and limits new reset messages to one per account per five minutes. Expired or used reset links are not delivered by the worker.
- Queue delivery uses each tenant's configured encrypted SMTP settings, falling back to platform SMTP only when that tenant selected platform mode. A broken custom secret fails rather than silently using another sender. Provider acceptance is required before marking sent. Stable Message-ID supports retries but does not guarantee exactly-once SMTP delivery after an acceptance/acknowledgment loss.
- Atomic claims prevent simultaneous workers from sending the same current claim. A 15-minute stale lease recovers abandoned processing jobs. Failures back off and stop after five attempts. Admin retry resets the attempt counter and schedules another dispatch. Only error codes are stored; provider responses are not logged.

## Deployment requirements

Apply migration `0088_user_notification_locale.sql` before the updated routes. No production migration is performed by this change.

Platform SMTP uses `SMTP_HOST`, `SMTP_USER`, `SMTP_FROM` (same address as SMTP_USER), `SMTP_FROM_NAME`, `SMTP_PASSWORD`, TLS port 465. Tenant custom SMTP additionally requires the existing 64-hex-character `FOON_MAIL_ENCRYPTION_KEY`. Use a trusted `APP_URL` for password reset links. Server environment values must be configured in Hostinger; a passing local fake-transport test does not establish production delivery or inbox placement.

After committed account/order operations, Next.js `after()` attempts a small queue batch. To drain retries while there is no web traffic, schedule `npm run notifications:worker` every minute on a trusted host with the same database, SMTP and encryption environment. Alternatively, a trusted scheduler may POST `/api/internal/notifications` using `Authorization: Bearer <FOON_NOTIFICATION_WORKER_TOKEN>`; the token must be at least 32 characters. The endpoint accepts no recipient/content input and returns counts only. Do not put the token in a URL or public browser code.

Confirmed reservations are automatically marked `no_show` by scheduling `npm run reservations:no-show-worker` every minute on the same trusted host. The grace period is configurable per branch in branch settings from 0 to 1440 minutes; it defaults to 30 minutes after the reservation time. The worker commits the status, a system-attributed audit event and the customer's in-account/email notification together. Reservations linked to an order that is not cancelled are left unchanged. Email delivery still depends on the separate notification worker and configured SMTP.

Review the admin email outbox for pending/failed status, then use `npm run mail:verify` to verify SMTP authentication without sending a message. An authenticated SMTP connection does not prove mailbox delivery.

## Verification and limits

Local tests cover migration replay, owner/customer registration, transactional order events for unverified accounts, order replay, account isolation, read receipts, reset deduplication, actual SQL claims/stale recovery, transport failure/backoff, custom-tenant credential routing and English/French notification copy. Delivery tests use a fake transport and do not send external messages.

Browser checks cover English/French cookie-only catalog/customer interfaces at 320px and the retail/laundry cart flow in three languages. These are functional and layout assertions; screenshot capture may be disabled in the local runner. They do not establish that every activity, administrator state, notification template or merchant-entered translation has had visual acceptance testing.

Email verification-token issuance/consumption, SMS/WhatsApp campaign providers, real inbox/SPF/DKIM/DMARC checks, web push and the remaining appointment/quote workflows are separate work. Existing stored notifications keep the language used when created; changing locale affects future email/events and interface labels.

## Payment notification follow-up

This follow-up needs no new migration. Disposable MySQL tests exercise synthetic signed provider callbacks and fake email transport, plus customer status/read receipts in Chromium at 320px. It does not verify a live payment or actual SMTP inbox delivery. Existing production SMTP configuration, event/channel rules and a trusted retry worker remain required.
