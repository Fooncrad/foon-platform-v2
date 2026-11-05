# FOON Display Player — cross-platform contract

## Scope of this tranche

This contract is the stable boundary between FOON Cloud and native playback agents. It does not claim that every device is supported or that native Windows, Linux, Android, and macOS agents are already shipped. Each agent must implement the same protocol and report what its OS, GPU, decoder, and display stack actually exposes.

## Platforms and compatibility

- Windows and Linux: native agent adapters can enumerate display outputs through their platform APIs.
- Android: output discovery and external-display control vary by vendor, OS version, and device SDK. An adapter may report only the outputs it can verify.
- macOS: a native adapter can be added against the same contract.
- Compatibility is reported as `compatible`, `limited`, or `unsupported`; never infer support from a model name alone.
- 4K is reported per connected output only when the negotiated mode is at least 3840×2160. A 4K-capable display alone is not proof that the player, cable, GPU, or decoder can deliver 4K.

## Playback rules

- One player is one logical device. Its connected outputs mirror one playlist and one playback timeline by default.
- Independent per-output playlists are not implied by the base protocol.
- Silent images and silent videos are valid. Progress is driven by slide duration, media completion, and playback errors—not by audio presence.
- Multiple physical players may be placed in one synchronized group. Cross-device synchronization is best-effort and depends on clock accuracy, network latency, and decode performance.

## Transport

- HTTP polling remains the authoritative recovery/fallback path.
- WebSocket carries invalidation hints only. The player refetches the authoritative playlist over HTTPS.
- Reconnect must trigger an immediate authoritative refetch; bounded polling continues as a safety net.
- Device identity, enrollment, revocation, heartbeat, and capability reporting must be authenticated and tenant-scoped before native agents are considered production-ready.

## Current implementation status

This PR ports the existing tenant-scoped display advertising, kiosk PIN, campaign-key, polling/WebSocket relay, and protocol contract into `main`. The protocol module validates capability reports and classifies the outputs reported by an agent. Native OS adapters, secure device enrollment/rotation APIs, per-output native rendering, hardware qualification, and end-to-end physical-device tests remain follow-up work. No physical hardware has been certified by this code change.
