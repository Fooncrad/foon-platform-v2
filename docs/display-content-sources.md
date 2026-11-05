# FOON display content sources

The display playlist supports three creative sources:

- `media`: an image already imported into the tenant's display asset store, or a hosted HTTPS MP4/WebM URL.
- `restaurant_menu_item`: a live reference to an enabled restaurant menu item.
- `catalog_product`: a live reference to an enabled product/service in the shared activity catalog.

For menu/catalog references, the public player resolves the current name, description, image and price when it refreshes the playlist. A product that is disabled or archived is omitted from playback. The manager reads only records belonging to the active tenant and requires the display-advertising entitlement plus owner/manager membership.

Images selected from the account media library are copied through the existing tenant asset pipeline before being attached to a public screen. This avoids exposing private account-library storage URLs to kiosk devices.

## Current video boundary

The manager still accepts a hosted HTTPS MP4/WebM URL; it does not upload video bytes. Direct video upload must wait for a configured object-storage backend with signed upload/download URLs, MIME and size verification, tenant quotas, and cleanup rules. Storing large video files in the relational database is intentionally not used as a shortcut.

## Remote operation

Screen changes are delivered through the existing authenticated WebSocket invalidation channel, with polling as recovery. The browser player reports its own playback/network/visibility health. These reports are browser telemetry and do not certify HDMI output, native OS display enumeration, or hardware decoding.

## Validation and rollout

Run `npm run test:display-advertising`, `npm run test:migrations`, `npm run typecheck`, and `npm run build`. Apply migrations only through the reviewed migration pipeline. No production migration or deployment is performed by this feature branch.
