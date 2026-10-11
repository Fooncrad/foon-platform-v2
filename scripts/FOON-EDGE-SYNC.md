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

## Cloud sync protocol (implementation contract; not yet deployed)
- Assign every local event a stable key `<device-id>:<event-seq>` and preserve the original event payload across retries. Device IDs must be issued and bound to a tenant and branch by the central server.
- Submit events in local sequence order over authenticated HTTPS. Include the event key, tenant, branch, device identity, event type, payload, and schema version. Never trust tenant or branch identifiers supplied solely by the client.
- The central API must transactionally insert the event key into a unique inbox table and apply its business mutation in the **same transaction**. Repeated submissions return the original durable receipt without reapplying the mutation.
- Enforce tenant/branch ownership, employee/device permissions, schema compatibility, and allowed status transitions on the central server. Conflicting mutations require an explicit conflict response and operator resolution; do not silently overwrite cloud state.
- A successful HTTP status alone is **not** an acknowledgement. Require a server-issued receipt tied to the exact event key and payload digest; the trusted sync worker validates it before marking the matching outbox row synced.
- Persist the cloud receipt ID and acknowledgement timestamp locally. Retries after process restart must be safe; an unavailable cloud server must leave the outbox pending and use bounded exponential backoff with jitter.
- Surface `pending`, `retrying`, `conflict`, and `synced` states to operators. Do not claim cloud success while an event is pending.
- Keep card payments, externally confirmed reservations, and irreversible actions behind online/provider-confirmed workflows until their specific offline reconciliation contracts have passed testing.

### Acceptance checks before enabling for stores
1. Submit an event, lose connectivity after cloud commit but before local acknowledgement, then retry: one cloud mutation, one durable receipt.
2. Restart the local gateway and sync worker while events are pending: no lost or reordered events.
3. Replay an event with the same key but different payload: reject with a conflict and preserve evidence.
4. Attempt a different tenant, branch, device, or revoked credential: reject without writing business data.
5. Exercise simultaneous status changes on two devices and resolve conflicts deterministically.
6. Restore an encrypted backup and verify SQLite integrity, outbox count, and cloud reconciliation.
