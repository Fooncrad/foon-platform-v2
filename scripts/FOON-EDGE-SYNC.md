# FOON Edge sync safety contract

The SQLite gateway is an experimental component, not a deployed or certified offline POS system.

## Local event lifecycle
1. An order or status change is committed atomically to orders, events and outbox.
2. GET /outbox lists unsynchronized events in sequence order.
3. A future trusted cloud sync worker must submit each event with an immutable idempotency key and verify the cloud response.
4. Only then should the worker acknowledge that event. The current POST /outbox/ack endpoint **does not cryptographically verify cloud receipts** and must not be exposed to untrusted clients or treated as proof of cloud delivery.
5. Unacknowledged events survive process restart.

## Required before production
- Implement server-verified acknowledgements and persist cloud receipt IDs.
- Use HTTPS/mTLS and per-device authorization on the local network; never expose the shared bearer token in a browser.
- Add transactional migration/version management, backup/restore, SQLite integrity checks, and WAL checkpoint policy.
- Add disk-full, sudden power loss, process crash, duplicate delivery, network partition and concurrency tests.
- Integrate POS, KDS and printers and enforce branch isolation and employee roles.
- Do not process offline card payments without a certified payment-provider workflow.

Local smoke test (Node 24):
```sh
node --test scripts/foon-lan-sqlite.test.mjs
```
