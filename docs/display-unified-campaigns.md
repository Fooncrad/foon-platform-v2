# FOON unified display campaigns

## Product contract

A campaign is authored once by an owner or manager in the FOON workspace and can target both:
- registered display players belonging to the tenant; and
- the public storefront hero/banner for that tenant's menu or activity page.

The default destination selection in the campaign composer is:
- `display_screens = true`
- `storefront_banner = true`
- `branch_scope = all`

“All branches and devices” means all enabled, tenant-owned display screens and the tenant's public storefront. It never means arbitrary/unpaired devices. Explicit branch/device selections narrow the scope.

## Delivery architecture

1. The FOON campaign API is the source of truth for campaign identity, tenant, destinations, schedule, creative, and lifecycle.
2. Display players receive eligible campaign creatives through the existing display playlist API and realtime invalidation channel. Polling remains the recovery path.
3. The public storefront reads only active, published, in-window campaigns for its own tenant and renders a responsive hero creative. It must not expose draft campaigns or another tenant's media.
4. The player and storefront use the same campaign creative record, but may use destination-specific renditions/layout metadata (16:9 / 9:16 for displays and responsive banner crop for storefront).
5. A campaign can be paused, scheduled, edited, or ended centrally. Changes invalidate affected players and are visible on the next storefront request/revalidation.

## Creative requirements

- Images, uploaded video, hosted MP4/WebM, text/ticker, and live menu/catalog references.
- Arabic, English, and French copy with editable generated suggestions.
- Destination-specific preview before publishing.
- Campaign schedule with timezone-aware merchant input stored consistently in UTC.
- Offline-capable display playback using the player's existing cache; storefront falls back to its normal cover if campaign media is unavailable.

## Security and tenancy

- Every write requires same-origin, authenticated owner/manager membership, and the `display_advertising` entitlement.
- Resolve the tenant from the authorized membership, never from a client-supplied arbitrary tenant ID.
- Screen fan-out is limited to enabled screens owned by that tenant and optionally selected authorized branches.
- Public storefront lookup is tenant-bound by the resolved storefront slug and returns only published campaigns inside their schedule window.
- Media bytes must use a configured object-storage adapter with signed upload/download URLs, MIME sniffing, strict size limits, per-tenant quotas, and orphan cleanup. Do not store video bytes in MySQL or claim direct upload until the adapter is configured and tested.
- Do not leak private account-library URLs or server secrets to public players.

## Acceptance criteria

- One campaign can publish to both screens and storefront banner by default.
- The merchant can disable either destination independently.
- “All” reaches every enabled, paired screen in the tenant and the storefront, while selected scope is branch/device constrained.
- The same campaign can be previewed in each destination's aspect ratio before publishing.
- Publish, pause, schedule, edit, and end propagate without visiting each screen.
- Screen health and last-seen telemetry remain visible to the merchant.
- The feature works for all supported FOON activity types, using activity-appropriate catalog/menu sources and templates.
- Tests cover tenant isolation, entitlement, owner/manager authorization, branch/device fan-out, public draft exclusion, schedule boundaries, both destinations, and all supported activity codes.

## Rollout constraints

This work is delivered through reviewed pull requests only. No automatic merge, production deployment, production environment mutation, or direct production database operation is part of development.
