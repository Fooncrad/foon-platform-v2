# FOON Local Edge secrets

Run on the **local restaurant edge server**, not in a customer browser:

```sh
node scripts/foon-edge-generate-keys.mjs
```

This generates two distinct 384-bit random secrets:

- `FOON_LAN_TOKEN`: access to local gateway endpoints.
- `FOON_EDGE_ACK_SECRET`: additional authorization required to acknowledge outbox events.

Set both as private environment variables for the edge service. Do not copy actual secret values into GitHub, frontend code, logs, screenshots or public configuration. Keep a secure offline recovery copy and rotate them if exposed. The acknowledgment endpoint remains disabled until the second key is configured.

**Important:** the separate ACK key is only an access-control safeguard. A future trusted sync worker must verify cloud delivery before calling `/outbox/ack`. Do not expose the acknowledgment key to POS/KDS browsers.
