-- FOON Edge: central idempotent event inbox (schema only; do not auto-apply to production).
-- Application must authenticate device ownership and perform business mutation
-- in the SAME database transaction as the initial inbox insert.
CREATE TABLE IF NOT EXISTS edge_sync_inbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  branch_id VARCHAR(64) NOT NULL,
  device_id VARCHAR(128) NOT NULL,
  event_seq BIGINT UNSIGNED NOT NULL,
  event_kind VARCHAR(64) NOT NULL,
  order_id VARCHAR(128) NOT NULL,
  payload_sha256 CHAR(64) NOT NULL,
  receipt_id VARCHAR(128) NOT NULL,
  applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY edge_sync_inbox_event (device_id, event_seq),
  UNIQUE KEY edge_sync_inbox_receipt (receipt_id),
  KEY edge_sync_inbox_tenant_branch (tenant_id, branch_id, applied_at),
  KEY edge_sync_inbox_order (tenant_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
