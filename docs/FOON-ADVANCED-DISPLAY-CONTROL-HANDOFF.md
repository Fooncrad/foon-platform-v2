# FOON Advanced Digital Signage — engineering handoff

**Working branch:** `fix/display-campaign-multimedia-20261107`  
**Current review:** [PR #498](https://github.com/Fooncrad/foon-platform-v2/pull/498)  
**Status:** implementation in progress; do not merge or deploy until validation is complete.

## Product objective

Build FOON into a cross-platform digital-signage and remote-screen operations system for restaurants and multi-branch businesses. The goal is not merely to rotate images: it is to manage campaigns, screen fleets, schedules, audio, health, device capabilities, recovery, and (where hardware permits) physical power state from one merchant console.

Do not claim that a feature is unique to FOON or that all TV models are supported without market research and device qualification. Differentiate through an integrated, measurable product experience.

## Work already present before this handoff

- Tenant-scoped screen creation and one-time pairing/token flow.
- Campaign fan-out to up to 100 active displays, optional branch targeting, campaign lifecycle, schedules, and menu-cover destination.
- Multi-image campaigns (up to 20 images), ordered slides, video append, image/catalog sources, transitions, badges, and AI copy helper.
- Same-tenant asset ownership checks, tenant/manager authorization, entitlement checks, branch PIN checks, and audit events for uploads.
- Kiosk PIN protection with salted scrypt, signed short-lived sessions, failed-attempt lockout.
- Browser player with polling recovery, optional authenticated WebSocket invalidation, offline caching for eligible public playlists, and 30-second browser health telemetry.
- QR pairing, responsive player layout, and a shared capability protocol in `lib/display/player-protocol.ts`.
- Merchant-side software controls: pause/resume campaigns, pause/enable screens, change layout/QR/refresh settings, reorder/enable/delete slides, rotate a screen token, and delete a screen.

## Changes made in this tranche

1. Added additive migration `migrations/9999_zz_display_audio_tracks.sql` adding nullable `display_slides.audio_url`. Existing campaigns remain silent; no destructive DDL is used.
2. Extended the tenant asset upload endpoint to accept a bounded audio MIME allowlist (MP3, WAV, AAC, MP4 audio, OGG, WebM audio), preserve raw audio bytes, and store the MIME type. Image uploads continue through the existing image normalization path.
3. Extended campaign creation to validate the audio asset belongs to the same tenant and has an allowed audio MIME type, then attach the audio URL to the campaign's slides.
4. Exposed `audio_url` in the merchant slide listing and public player playlist.
5. Added an audio upload field to the campaign editor. The player uses one persistent looping audio element so the audio bed does not restart on each image transition. If browser autoplay is denied, it displays an explicit “tap to enable campaign audio” action.
6. Added the Screen Wake Lock API to the browser player. It requests a screen wake lock while the player is visible, releases it when hidden/unmounted, and retries when the page becomes visible again.
7. Added source-level regression assertions for the audio and wake-lock wiring.
8. Made remote screen pause visible in the player while retaining the screen identity, wake lock, and health heartbeat so the merchant can resume it remotely; the dashboard clarifies that pause is not physical TV power-off.

## Important limits — do not misrepresent

- Screen Wake Lock only asks a supporting browser/OS not to dim or sleep the display while the page is visible. It is not a power-on command, does not override every TV energy policy, and is unavailable or restricted on some TV browsers.
- Browsers commonly block audible autoplay until the user interacts once. The player now exposes a fallback action; unattended audio still requires device/browser kiosk policy or native configuration that allows it.
- A web page cannot reliably power on a TV that is off or in deep standby. Physical power-on/off requires a supported device integration: native agent, vendor API/MDM, HDMI-CEC, Wake-on-LAN, or a managed power controller. Each is model/network dependent.
- Existing screen pause/enable actions change FOON playback eligibility. They do not turn the physical panel or Android box off.
- The current capability protocol is a contract, not a shipped native agent. It does not yet enumerate actual HDMI outputs or certify 4K on physical hardware.
- 4K/large-format support is responsive browser layout plus capability reporting groundwork, not hardware certification. Verify negotiated output resolution, decoder, cable, thermal stability, and sustained playback on each approved device model.

## Next engineering phase: native fleet control

Implement this as a separate, testable subsystem rather than adding fake power buttons to the web player.

### A. Device enrollment and trust

- Create a device-agent enrollment flow with one-time pairing, tenant and screen binding, key rotation, revocation, and device inventory.
- Issue a device identity/key pair; prefer Ed25519 signed requests or mutual TLS. Keep private keys in OS-protected storage (Windows DPAPI/Credential Manager, Android Keystore, Linux protected service credentials).
- Do not reuse the public screen token as a native-agent administrative credential.
- Every agent request must be authenticated, tenant-scoped, replay-resistant, timestamped, and rate-limited.

### B. Durable command queue

Add an append-only command/event model with:
- command ID, tenant ID, screen/device ID, command type, canonical JSON payload, issuer, created/expiry timestamps;
- status: queued, delivered, acknowledged, completed, failed, expired, cancelled;
- attempt count, last delivery, result/error, idempotency key;
- audit history and strict tenant/device foreign keys.

Commands should include:
- `refresh_playlist`, `reload_player`, `pause_playback`, `resume_playback`;
- `set_volume`, `mute`, `unmute` where permitted;
- `wake_display`, `display_sleep`, `power_on`, `power_off`, `reboot_agent` only when the agent advertises the corresponding capability;
- `set_output_mode` only for outputs and modes reported by the device.

The cloud should enqueue commands and publish an invalidation hint. Agents should poll/subscribe, verify signature, expiry, target and capability, execute idempotently, then acknowledge with a structured result. Never mark a command successful merely because it was queued or delivered.

### C. Native adapters

- **Windows:** background service/agent, startup recovery, display enumeration, power requests, monitor control only when the hardware API supports it; optional CEC/WOL adapter.
- **Linux:** systemd-managed agent, DRM/KMS or compositor output discovery, supported DPMS/CEC integrations.
- **Android TV / Android Box:** native Android app/device-owner or kiosk mode, foreground service where policy permits, Android Keystore, wake locks, boot receiver where permitted, HDMI-CEC/vendor power integration when available.
- **Samsung Tizen / LG webOS / commercial panels:** implement vendor-specific adapters only against documented and authenticated APIs/MDM capabilities. A generic browser cannot promise equivalent power control.

All agents report capabilities instead of pretending every command is supported.

### D. Fleet operations and premium differentiators

- Fleet groups by branch, zone, screen role, campaign, and device model.
- Synchronized playback groups with clock-offset measurement and drift correction; expose synchronization quality rather than claiming frame-perfect sync.
- Schedules and dayparts, emergency takeover, priority campaigns, quiet hours, and per-screen overrides.
- Health dashboard: online/last seen, player version, OS, browser/agent version, negotiated resolution, decoder support, storage, temperature when exposed, audio state, playback errors, command status, and last screenshot only with explicit privacy controls.
- Remote diagnostics, safe player restart, staged rollout, agent update channels, rollback, maintenance windows, and alerting.
- Offline content packages with checksums, atomic download/swap, storage quotas, expiry, and protected-content policy.
- Role-based access for owner/manager/support, step-up confirmation for power/reboot commands, and immutable audit logs.

## Required acceptance tests before release

1. Run migration parser and migration tests against a disposable MariaDB/MySQL database only; confirm the migration is discovered in lexical order and is additive.
2. Upload each supported audio type; reject unsupported MIME, oversized file, cross-tenant asset, and image URL supplied as audio.
3. Confirm audio persists through image slide transitions without restarting; test browser autoplay blocked and user-gesture recovery.
4. Confirm silent campaigns still work and audio removal returns to silent playback.
5. Test Wake Lock support, denied permission, hidden/visible transitions, page reload, and unsupported browser.
6. Exercise screen pause/enable, campaign pause/resume, realtime invalidation, polling fallback, kiosk PIN, and token rotation.
7. Add integration tests for agent enrollment, command signature, replay rejection, expiry, idempotency, capability mismatch, acknowledgement, and revocation before exposing power controls.
8. Qualify physical devices: cold boot, browser auto-launch, sleep/wake, HDMI hotplug, 1080p/4K negotiated modes, audio output, 8-hour soak, network interruption, and power recovery.
9. Keep power controls disabled for a device until its agent reports the capability and a hardware integration test passes.

## Safety and deployment boundary

- Do not merge PR #498, change `main`, deploy, or modify production environment values without explicit approval.
- Do not run migrations against production as part of code review.
- Use disposable local/test databases for migration and integration testing.
- Preserve existing tenant authorization and plan entitlements on every new API.
- Do not expose native-agent secrets to browser JavaScript or public screen tokens.
- Never show a “powered on/off” success state without a verified hardware acknowledgement.

## Handoff request to the next agent

Continue on this branch. First inspect the latest commit and rerun the tests after fetching current files. Validate SQL placeholder counts and migration ordering, then complete audio integration tests. Next design the native agent enrollment and durable command queue as a separately reviewed phase. Do not implement unsupported TV power controls as web-only UI.
