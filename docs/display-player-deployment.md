# FOON Display Player — deployment guide

## Device-independent baseline

FOON's current player is a web player, not a model-specific Android box application. A screen device can run it when it has:

- A modern browser with JavaScript, Fetch, HTML5 video, and CSS fullscreen support.
- A working network connection to the FOON site for initial loading and authoritative playlist refresh.
- An HDMI, DisplayPort, USB-C, or built-in display output supported by the device's operating system.
- A device/browser configuration that permits the player page to stay open in fullscreen or kiosk mode.

The practical baseline therefore includes Windows PCs and mini PCs, Linux PCs, macOS computers, Android TV boxes, and smart displays that provide a compatible browser. Browser and codec differences still matter; no claim is made that every device model or every external display mode has been physically certified.

## First-time setup

1. Create a screen in the FOON merchant dashboard at `/restaurant/displays`.
2. Copy the one-time screen player URL returned when the screen is created. Treat it as a secret: anyone with the URL can attempt to view that screen.
3. Open the URL in the device's browser while connected to the internet.
4. If kiosk PIN protection is enabled, enter the PIN once in that browser profile. Keep the device in a managed kiosk profile and do not share the PIN.
5. Put the browser into fullscreen/kiosk mode using the operating system or browser's supported kiosk launch option.
6. Connect the display using the device's normal display settings. Configure mirroring or extended desktop at the operating-system level.
7. Confirm that the screen appears online in FOON and that a playlist update reaches the device.

## Platform setup notes

| Platform | Suggested runtime | Notes |
| --- | --- | --- |
| Windows 10/11 | Current Microsoft Edge or Chrome in kiosk mode | Configure display mirroring/extension in Windows Display Settings. |
| Linux | Current Chromium in a managed kiosk session | Use the desktop/compositor display settings to select the active output and resolution. |
| Android TV / Android box | Current vendor browser or a maintained Chromium-based kiosk browser | Browser autoplay, background suspension, and external-display support vary by vendor and Android version. |
| macOS | Current Safari or Chrome in fullscreen | Configure external display arrangement in macOS Displays settings. |
| Other smart displays | Built-in browser only if it meets the baseline above | Validate codec support, sleep behavior, and kiosk persistence before rollout. |

These are browser deployment paths, not separate native applications. A device without a supported browser needs a native adapter or a supported external player; the shared protocol alone does not install that adapter.

## Playback, networking, and offline behavior

- HTTP polling is the authoritative playlist refresh and recovery path.
- When the optional realtime relay is configured, WebSocket messages are invalidation hints only. The player refetches the authoritative playlist over HTTPS.
- If the relay is absent or unreachable, polling remains the fallback.
- Public playlists and same-origin media may be cached best-effort by the existing service worker. Browser storage eviction, device sleep, and network loss can still interrupt playback.
- PIN-protected playlists are not cached offline. Do not treat offline caching as a guaranteed 24/7 digital-signage mode.
- External video URLs require a working internet connection and a codec supported by the device's browser.
- One player controls one playlist timeline. Multiple outputs connected to the same device mirror that timeline by default. Independent playlists per HDMI output are not part of this contract.

## Resolution and device qualification

Do not infer 4K support from a product name, a 4K panel, or an HDMI connector. A future native adapter must report the negotiated mode of each connected output. Qualification must also verify GPU/decoder capability, cable/adapter bandwidth, thermal stability, and sustained playback.

Before approving a device model for production, test:

- Cold boot and automatic kiosk launch.
- Screen sleep/wake and power recovery.
- HDMI disconnect/reconnect and resolution changes.
- At least 8 hours of continuous image and video playback.
- Network interruption, recovery, and playlist updates.
- PIN-protected and public screen behavior.
- Audio-disabled and silent-video playback.
- Actual negotiated 1080p/4K modes where applicable.

## Native adapter boundary

The shared capability protocol is defined in [display-player-cross-platform.md](./display-player-cross-platform.md). It is the integration contract for future Windows, Linux, Android, and macOS native agents. This web-player release does not yet ship those agents, OS-level HDMI discovery, device enrollment/revocation APIs, or physical-device certification.
## Player health telemetry

The browser player sends a small health report every 30 seconds and when network/visibility state changes. The merchant dashboard can show the last report and a reported playback error. Reports include the browser-detected platform family, viewport size, online/visible state, and basic H.264/WebM decode declarations.

These are browser-reported diagnostics only. They do not prove physical HDMI connection, negotiated output resolution, GPU decode performance, or 4K certification. Those require a native platform adapter and hardware testing. Health reports are scoped to the secret screen token and are not a substitute for authenticated native-device enrollment.


## Campaign audio and browser wake lock

Campaigns may attach a tenant-owned audio bed (MP3, WAV, AAC, OGG, or WebM audio, up to 10 MB). The player keeps one audio element alive across image transitions within the campaign. Browsers may block audible autoplay; when that happens, the player displays a first-interaction control. For unattended installations, qualify the kiosk browser/device policy and test audio output before rollout. Silent campaigns remain supported.

While the player page is visible, it requests the browser Screen Wake Lock API when available and re-requests after the page becomes visible again. This can reduce browser/OS screen dimming, but it cannot override all TV energy settings and does not power on a TV that is off or in deep standby.

## Remote operations versus physical power

The merchant console can remotely change FOON playback state (pause/enable screens and campaigns), request a playlist refresh through invalidation/polling, and change supported player settings. These are software/player commands only.

Physical panel or device power-on/off, reboot, HDMI output changes, and vendor-specific sleep control require a separately installed and authenticated native agent or a supported vendor/MDM/CEC/WOL integration. Availability varies by exact model, firmware, network, and standby mode. Do not report a physical power command as successful until the device agent returns a verified hardware acknowledgement.
