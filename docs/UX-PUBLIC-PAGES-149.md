# FOON V2 — public account and content pages UX, batch #149

## Dependency and merge order
**This is a stacked PR built on #148.** Review/merge #148 first. Then compare #149 with current `main`, rebase/retarget if needed, and merge #149 manually. Never merge an earlier batch as a workaround or auto-deploy.

## Audited differences
- `/login` had its own card logo and lacked the public shared header/footer and entry links; `/register` used the same isolated layout.
- Published `/p/{slug}` CMS content had only a basic FOON link and no shared footer, public language selector or current light/dark theme.
- Marketing homepage and marketplace were already addressed by #148. Neither their marketplace country isolation nor store visibility SQL is changed here.

## Implemented
- Reuse **exactly the same** public header/footer/theme control from #148 on `/login` and `/register`, retaining the original forms, tenant creation, 2-stage signup, password recovery, email verification and role-based account routing.
- Remove only the redundant logo *link* inside the auth card; the public header is the canonical FOON home link. Keep the existing account recovery and registration links for continuity.
- All published CMS pages receive a shared public header/footer and theme, and the optional published CMS footer links. With explicit `?lang=ar|en|fr`, the selected CMS language stays in the URL; when changed using the page's language selector, the URL and translated page content update together. Without a valid URL language the stored UI language is used. Missing translated titles/body fall back to Arabic rather than printing `null`.
- Scoped light/dark CSS, 320px mobile layout and semantic main/heading/article structure, without changing the actual CMS text or injecting HTML.

## Security / unchanged business behavior
- `/p/{slug}` still queries **published content only**, validates the slug, returns 404 for drafts and renders content as escaped React text.
- No change to auth endpoints, password policy, redirect allowlist, sessions, employee/customer role separation, country-market filters, payment systems or store themes.
- No migration, external dependencies, account PII collection or production DB operations.

## Tests and acceptance
- Unit tests for URL/cookie locale precedence, invalid values and Arabic text fallback are included in `test:resources`.
- Extended Playwright journeys on disposable MariaDB: login/registration keep forms and 2-stage values at 320px, public theme persists; published CMS content responds to French/English/Arabic URL and theme; drafts return 404.
- Independent QA before production: real mobile/desktop AR/EN/FR, virtual keyboard, auth form focus, screen reader, long legal documents, actual published pages, and stale/hidden content. CI is supplemental.

Manual review/merge after #148. No automatic merge or Hostinger release.
