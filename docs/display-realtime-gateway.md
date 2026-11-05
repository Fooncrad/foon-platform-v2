# FOON display realtime gateway

The display player keeps its bounded HTTP polling loop as the source-of-truth recovery path. When the optional gateway is configured, it also opens a WebSocket and reloads the authoritative playlist immediately after an invalidation event.

## Components

- Next.js issues a 60-second HMAC-signed ticket only after checking the screen token, enabled/paused state, and kiosk PIN session when PIN protection is enabled.
- Merchant mutations publish an invalidation to the relay over HTTPS using a server-only bearer secret.
- The relay validates the ticket and trusted browser Origin, then broadcasts only to sockets subscribed to that screen.
- The player treats a WebSocket event as a hint to refetch the playlist; event payloads never contain ad content or override API authorization.
- Polling remains enabled and recovers changes missed while offline or disconnected.

## Deploy the relay separately

Deploy `services/display-realtime` as a long-running Node 24 service behind TLS. The reverse proxy must forward WebSocket upgrades to port 8789. Do not expose the service over plain public HTTP.

Required relay environment:
- `FOON_DISPLAY_REALTIME_SECRET`: random secret of at least 32 characters; must exactly match the Next.js server secret.
- `FOON_DISPLAY_ALLOWED_ORIGINS`: comma-separated exact HTTPS origins allowed to open player sockets, e.g. `https://nfoodz.com`.
- `PORT`: optional, defaults to `8789`.

Required FOON application environment:
- `FOON_DISPLAY_REALTIME_SECRET`: same secret, server-side only. Never prefix with `NEXT_PUBLIC_`.
- `FOON_DISPLAY_REALTIME_HTTP_URL`: HTTPS base URL of the relay, e.g. `https://display-realtime.example.com`.
- `NEXT_PUBLIC_FOON_DISPLAY_REALTIME_URL`: WSS URL of the relay, e.g. `wss://display-realtime.example.com/ws`.

The relay exposes `GET /health`, authenticated `POST /publish`, and WebSocket `/ws?ticket=...`. The publisher uses a bearer secret; the relay accepts only short-lived HMAC tickets and exact allow-listed Origins. Put a rate limit at the reverse proxy and restrict relay egress/ingress as appropriate.

## Safe rollout

1. Deploy the relay and configure the three FOON environment values.
2. Verify `GET /health` and WebSocket upgrade through the TLS proxy.
3. Run a test screen and verify create/update/disable mutations produce immediate playlist reloads.
4. Disconnect the relay and confirm the existing polling loop continues to update the screen.
5. Do not disable polling. The relay is an acceleration channel, not the source of truth.

If relay settings are absent or the relay is unavailable, the player continues using polling and kiosk/offline behavior. This PR does not deploy the relay or change production environment values.
