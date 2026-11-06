# FOON unified multi-screen campaigns

## Merchant behavior

The display manager now offers a campaign publishing action. A merchant composes the creative once (existing image, hosted MP4/WebM, or a live menu/catalog source), independently enables screen playback and/or the menu-cover destination, and chooses either all branches or a set of specific branches for screen playback. The server resolves the target set from enabled, non-paused displays registered to the authenticated tenant. A tenant with no branches can still target all registered displays.

The campaign fan-out creates one logical `campaign_id` and inserts an identical slide payload for each target screen inside one database transaction. The player continues to receive normal scheduled slides because fan-out rows leave `campaign_match_key` null; the existing optional campaign URL filter therefore does not hide the new content. When enabled, the menu-cover destination writes the same FOON-hosted image into the tenant `storefront_config.coverUrl` through the existing resource-save path in the same transaction. This is consumed by both the restaurant menu cover and the activity storefront cover.

## Shared lifecycle

Each fan-out row carries the same campaign UUID. Enabling/disabling or deleting one campaign copy updates/deletes all copies for that tenant campaign and invalidates every affected screen. This keeps the user experience as one campaign even though the current player protocol stores a playlist row per screen.

## Safety and bounds

- Same-origin request, authenticated owner/manager membership, tenant entitlement, and additional-branch PIN gate use the existing display API context.
- Branch IDs are verified against enabled branches belonging to the same tenant.
- Only enabled, non-paused, tenant-owned screens are targets; no unregistered screen can receive content.
- Media URLs must resolve to a same-tenant FOON asset, hosted video URLs retain the HTTPS/MP4/WebM and private-host restrictions, and catalog sources are revalidated as enabled and tenant-owned.
- Schedule bounds and existing content duration limits are retained.
- The operation is transactional and capped at 100 target screens; larger sets return `TOO_MANY_DISPLAYS` rather than silently truncating.
- Realtime invalidations are sent after commit; the existing player polling remains the recovery path.

## Migration

`9999_display_unified_campaigns.sql` adds a nullable campaign UUID and lookup index to existing display slides. Existing rows remain unchanged.

## Not included in this slice

This change does not yet make a display campaign automatically replace the storefront/menu cover banner. The public menu and activity storefront already read `branding.coverUrl` from `storefront_config`, but a safe write path and a clear rule for restoring a manually chosen cover are still required. Do not claim the two destinations are fully unified until that integration is implemented and tested.
