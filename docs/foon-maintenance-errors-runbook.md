# FOON / NFOOD — maintenance and incident reference runbook

## What the app now handles
- Next App Router **404**, render failures (500) and global rendering failures have shared accessible, responsive AR/EN/FR pages.
- The public `/maintenance` route is informational only; `FOON_MAINTENANCE_MODE=1` enables the application-level **HTTP 503** maintenance response in `proxy.ts` (requires a running Next server; redeploy/restart to change the environment).
- `public/maintenance.html` is a self-contained AR/EN/FR **static fallback**. Copy it to a directory served **directly by nginx/CDN**, not only into a Node.js route. Keep nginx `error_page 502 503 504` serving it without proxying to Next. Hostinger managed Node plans may not expose custom nginx config; use Hostinger support or an independent edge/static page in that case.
- Operations API error JSON remains backward-compatible (`code`, `incidentId`), adds localized `message`, `status`, `X-Foon-Incident-Id` and `Content-Language`. Failures are logged server-side with the same reference.
- Render errors with `error.digest` show Next's server digest (correlate with Next logs); client render errors without a digest create a `WEB-XXXXXXXXXXXX` reference and submit *only* that reference + the allowed error class to a same-origin, rate-limited endpoint. Browser errors cannot be reported if the server itself is unavailable.
- Status messages do not claim an order or payment failed. A 502/503/504 may occur **after** an operation committed: verify order/payment state before retrying.

## Planned maintenance (when the app is running)
1. Enable `FOON_MAINTENANCE_MODE=1` in the Node.js deployment environment and restart the site. It gates **page GET/HEAD requests**, but deliberately does **not** block `/api` (including webhooks, health checks and existing active transactions), static files or the maintenance routes. This is **not** an authorization/security barrier.
2. Check a normal public page responds with **503**, `Retry-After: 300`, `Cache-Control: no-store`, and displays the three language choices.
3. Keep `/api/health` available to diagnose the backend; don't hide payment webhooks behind a 503 maintenance wall.
4. To restore site visibility, remove/disable the flag, restart/redeploy, verify `/api/health`, then test a public menu and authenticated workspace.

## Unexpected nginx 504 (Node server down or nonresponsive)
- **Next.js cannot render its own error page when nginx times out waiting for Next**. Deploy the static HTML fallback separately at nginx/CDN level.
- Example for an nginx instance you administer (NOT automatically installed on Hostinger):
  ```nginx
  error_page 502 503 504 /maintenance.html;
  location = /maintenance.html {
      root /srv/foon-error-pages;
      internal;
      add_header Cache-Control "no-store" always;
      add_header X-Robots-Tag "noindex" always;
  }
  ```
  Put the file at `/srv/foon-error-pages/maintenance.html` on **the proxy host**, not just the Next.js server. Verify 504 still carries 504 status (do not use `error_page ... =200`).
- A standalone static page cannot put its client-generated reference into nginx logs. For proxy 504 correlate **UTC time, URL, 502/503/504 status and nginx request ID** from proxy logs, never claim a browser code automatically exists in logs.
- Check Hostinger deployment, Node startup, app/runtime logs, memory/CPU, database availability and `/api/health`. Restart only after capturing logs. Do **not** apply SQL as a fix for a 504 without evidence.

## Diagnosing an app-level error
1. Ask for the displayed reference, HTTP status, UTC time, and the action attempted — without passwords, reset links or payment details.
2. Search Next/Hostinger logs for the exact `incidentId` / `error.digest`. Server `logIncident` stores the reference and code; it does not return stack traces to the user.
3. Use `status` and API `code` to locate the module. Investigate and fix the underlying problem in an isolated branch; manual review before merge. No production migrations unless independently verified.
4. API 400/401/403/404/409/429 still preserve their existing route-specific codes and authorization; reference identifiers are not authentication tokens.

## Deployment checklist
- Perform independent local `npm run typecheck`, `npm run lint`, `npm run build`, and `npm run test:system-errors`; use GitHub checks as supplemental validation.
- Test planned 503, 404, server + browser error fallback and AR/EN/FR at 320px width.
- Verify server/client error references appear in server logs. No PII, email, URL query strings or token in the browser incident reports.
- Confirm edge fallback in front of **nginx**, not only `public/maintenance.html`.
- Manual PR merge/deploy only. No database migrations in this batch.
