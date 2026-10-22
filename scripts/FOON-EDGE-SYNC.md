# FOON Edge sync safety contract

The opt-in Windows original-site MySQL outbox is documented in `apps/windows/README.md`. It shares the signed Edge ingestion protocol but does not use the separate SQLite gateway. `expectedTotalCents` binds desktop checkout totals; `expectedStatus` makes desktop status changes compare-and-set. Their conflicts require review and never acknowledge a changed order. Catalog responses include explicit `createOrders`/`updateOrders` grants; a view-only grant is not offline write authorization.

The SQLite gateway is an experimental component, not a deployed or certified offline POS system.

## Local event lifecycle
1. An order or status change is committed atomically to orders, events and outbox.
2. GET /outbox lists unsynchronized events in sequence order.
3. The trusted Node sync bridge submits each event with an immutable idempotency key and verifies a signed cloud receipt; the cloud API integration remains experimental.
4. Only then should the worker acknowledge that event. The local POST /outbox/ack endpoint validates signed receipts and requires its separate acknowledgement secret; neither secret nor the endpoint may be exposed to untrusted browser clients. A signed receipt is not proof of delivery until the central API and database transaction are deployed and independently tested.
5. Unacknowledged events survive process restart.

## Required before production
- Verify the deployed central API issues receipts only after a committed business mutation; independently test durable receipt storage and local acknowledgement.
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

### Cloud destination restrictions
The Node bridge rejects private, loopback, link-local, shared, multicast and reserved literal cloud addresses, including IPv4-mapped IPv6 and alternative IPv4 URL notation. Local DNS suffixes are rejected even with a trailing dot. Public literal addresses and configured HTTPS DNS names remain supported; local IPv6 loopback is supported for the gateway.

This is URL validation only. It does not resolve or pin DNS addresses and does not prevent a configured DNS name from resolving to a private network or changing its answer. Only configure a trusted cloud hostname and enforce destination restrictions at the network boundary before enabling the bridge for stores.
