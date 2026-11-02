# Batch 92 — automatic reservation no-show handling

- Branch settings now accept a no-show grace period from 0 to 1440 minutes; the default is 30 minutes after the reservation start.
- A scheduled worker locks and rechecks each due confirmed reservation before changing it to `no_show`.
- Reservations connected to any non-cancelled preorder are left unchanged.
- The status transition, system audit event, in-account notice and queued email are committed together. Repeated or concurrent worker runs cannot notify twice after the status has changed.
- Migration `0098_reservation_no_show_system_actor.sql` permits system audit events without attributing them to a user.
- Schedule `npm run reservations:no-show-worker` once per minute on a trusted host. The existing notifications worker remains responsible for SMTP delivery.

Production behavior is not active until the migration is applied and the worker is scheduled. No production migration or schedule change is performed by this branch.
