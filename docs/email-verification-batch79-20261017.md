# FOON V2 — Batch 79: transactional email verification (2026-10-17)

## Existing system
- `users.email_verified_at` and `email_verification_tokens` already exist in migrations 0002 and 0003; platform email outbox exists in migration 0016.
- Before this batch, account registration created an active account and workspace but never issued a verification email.
- The platform already has a mail worker that can deliver queued transactional email using the configured platform SMTP provider.

## This batch
- Both new owner and customer registration transactions atomically add a 24-hour, single-use, random 256-bit token and an outbox message. The database stores only the SHA-256 digest; raw tokens exist only in outbound mail.
- `/verify-email`: localized (Arabic, English, French) link-confirmation page with an explicit verification button; GET alone cannot consume a token.
- `POST /api/auth/verify-email`: same-origin protection, valid token shape, lock and re-check the active user, one-time token consumption, `email_verified_at` update and invalidation of the user's other pending tokens. Verification does **not** create a session, role, staff association or customer membership.
- `POST /api/auth/resend-verification`: requires the current authenticated active user, locks their account, enforces a 5-minute per-user cooldown, queues only when unverified, and returns no email address or raw token.
- Mail dispatcher skips expired or consumed verification tokens, using the same outbox-row-to-token relationship as password reset notifications.
- The merchant dashboard and customer account expose an email verification reminder, and both signup interfaces direct users to the verification page.

## Compatibility
- Accounts still activate their free store/customer relationship on initial signup, and may continue working while email is pending. **Verification is visible and functional but is not yet an authorization gate**. Do not claim otherwise.
- This is intentional until SMTP delivery is confirmed. Existing unverified accounts are not blocked retroactively.
- No new migrations needed: uses existing `email_verification_tokens`, `users`, `platform_notification_outbox`.
- Sending to a mailbox is not proof of successful SMTP delivery. Verify configured platform SMTP and worker `npm run notifications:worker` on Hostinger before enforcing an email-verified gate.

## Tests / release
- `npm run test:mail` includes new policy tests: token secrecy/hash, expiration, localization, cooldown.
- Registration HTTP integration exercises owner token queue, origin guard, verification, reuse rejection, throttled resend and persisted `email_verified_at`.
- Build, MariaDB integration, Playwright and appropriate verification checks must pass before manual merge and deploy.
- Verify production `APP_URL=https://nfoodz.com`, SMTP sender, notifications worker schedule, outbox status, AR/EN/FR templates and link delivery. Do not run destructive tests on the production DB.

## Further work
- Legal/privacy agreement checkbox and versioned acceptance records with published legal pages are not part of this batch.
- Google OAuth requires provider configuration, anti-forgery state and explicit scopes; do not add a pretend login button before it is working.
- Strict email-verified gating is a separate reviewed release after delivery tests.

**No automatic merge, no production mutation, no unreviewed SQL.**
