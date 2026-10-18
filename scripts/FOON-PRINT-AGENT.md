# FOON local print agent

The cloud creates a durable job when the configured order event occurs. This Node 24 agent runs on a computer inside the restaurant network, claims jobs using that branch's registered Edge device token, sends them to a configured network thermal printer, and reports success or failure. It consumes the same queue for every configured department printer, including departments created later, and for the customer receipt printer.

## Events

- Preparation printers receive only their configured `on_accept` or `on_prepare` event. Item-to-department routing stays data-driven through each printer's `departmentId` and the saved item assignments; for example, food prints in the kitchen and coffee at the bar. There is no fixed department-name list, so a newly created department can be routed without a code change.
- Customer receipt printers receive `on_paid` after the order is both completed and paid. A `both` printer can receive preparation tickets and the complete paid receipt according to its settings.
- Failed connections return the job to the durable queue with bounded exponential retry. After the configured attempt limit it is marked failed for operator review.

## Initial supported connection

This version supports network ESC/POS printers on private IPv4 addresses, using TCP port 9100. It intentionally rejects public, loopback, link-local, DNS, and arbitrary-port targets. USB, Bluetooth, and browser printer modes are not consumed by this agent yet. Arabic glyphs depend on the printer's ESC/POS firmware and configured code page; test the actual printer model before enabling automatic printing for live orders.

## Setup

1. Apply the repository migrations through `0099_admin_tenant_support_sessions.sql` on the intended cloud database using the normal reviewed migration process. Do not run migrations against production without its deployment approval and verified backup.
2. Enable `FOON_EDGE_PRINT_AGENT_ENABLED=true` in the cloud application environment.
3. Register a branch-scoped Edge device through the existing trusted device provisioning process. Keep its 96-character token only on the trusted local computer.
4. In that computer's private `.env.print-agent`, set:

```dotenv
FOON_EDGE_PRINT_API_URL=https://YOUR-FOON-HOST/api/edge/print-jobs
FOON_EDGE_CLOUD_DEVICE_TOKEN=THE_BRANCH_DEVICE_TOKEN
```

5. Install Node.js 24 and run `npm run print:agent`. Configure Windows Task Scheduler to start it at boot and restart it if it exits. Keep the computer and printers on the same trusted LAN.
6. Configure each section's active printer with connection `network`, its private IPv4 address, purpose `preparation`, and automatic event. Configure the customer invoice printer with purpose `customer_receipt` and event `on_paid`. Assign menu items to their operating departments in the restaurant settings.
7. Submit a test order, confirm the department ticket, complete and mark it paid, then confirm the customer receipt. Verify the queue reports both jobs as `printed` before relying on it during service.

`printed` means the local agent successfully sent the bytes to the printer's TCP socket; common ESC/POS printers do not provide a paper-out confirmation over port 9100. If the socket drops after printing but before the cloud acknowledgement, a retry can produce a duplicate. Do not configure cash drawer opening for this general agent; it sends print data only.
