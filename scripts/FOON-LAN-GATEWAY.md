# FOON LAN Gateway (prototype)

This is an experimental local relay for POS/KDS development, **not a production-ready offline deployment**. It does not yet integrate with the FOON POS UI, KDS UI, cloud synchronization or printers.

## Start on a trusted restaurant computer

Install Node.js 24 and set a strong secret (at least 32 characters). For example, in a trusted terminal:

```sh
export FOON_LAN_TOKEN="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("hex"))')"
export FOON_LAN_HOST=127.0.0.1
export FOON_LAN_PORT=8787
export FOON_LAN_DATA=./data/foon-lan-orders.json
node scripts/foon-lan-gateway.mjs
```

The default binds to loopback only. Do **not** change FOON_LAN_HOST to 0.0.0.0 or expose this HTTP service to other devices or the Internet. For LAN access, first deploy a trusted HTTPS reverse proxy with authenticated devices, restricted firewall rules, and proper TLS certificates. Browsers on an HTTPS site cannot reliably connect to a plain HTTP LAN endpoint. Never put FOON_LAN_TOKEN into public JavaScript or browser storage.

API: authenticated GET /health, GET /orders, GET /events (SSE), POST /orders and PATCH /orders/:id/status. All requests require Authorization: Bearer <secret>. The service writes a local JSON file; it is **not** a transactional database, has no per-employee roles, no signed event ledger, no reconciliation with the cloud, and no printing. Do not use it for real payments or rely on it as the only copy of customer orders.

Run automated smoke test:

```sh
node --test scripts/foon-lan-gateway.test.mjs
```

Before production: replace JSON storage with durable transactional storage, secure per-device identities and audit logs, implement a conflict-safe cloud outbox and acknowledgements, connect POS/KDS and printers, and test power failures and network partitions.
