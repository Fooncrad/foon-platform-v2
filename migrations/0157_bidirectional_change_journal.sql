-- One row per tenant/branch serializes journal allocation until the transaction commits.
-- Required to prevent a late-committing low AUTO_INCREMENT id being skipped by pull cursors.
CREATE TABLE IF NOT EXISTS foon_sync_scope_locks (
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 PRIMARY KEY (tenant_id,branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- Staging-only schema. Does not enable a sync worker.
CREATE TABLE IF NOT EXISTS foon_sync_changes (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 event_id CHAR(36) NOT NULL,
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 actor_id CHAR(36) NOT NULL,
 source_device_id CHAR(36) NOT NULL,
 entity_type VARCHAR(64) NOT NULL,
 entity_id CHAR(36) NOT NULL,
 operation ENUM('upsert','delete','movement') NOT NULL,
 base_version BIGINT UNSIGNED NOT NULL,
 next_version BIGINT UNSIGNED NOT NULL,
 event_timestamp VARCHAR(35) NOT NULL,
 payload_json JSON NOT NULL,
 payload_digest CHAR(64) NOT NULL,
 created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 UNIQUE KEY uq_foon_sync_event (event_id),
 KEY idx_foon_sync_pull (tenant_id,branch_id,id),
 KEY idx_foon_sync_entity (tenant_id,branch_id,entity_type,entity_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS foon_sync_versions (
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 entity_type VARCHAR(64) NOT NULL,
 entity_id CHAR(36) NOT NULL,
 version BIGINT UNSIGNED NOT NULL,
 last_event_id CHAR(36) NOT NULL,
 PRIMARY KEY (tenant_id,branch_id,entity_type,entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS foon_sync_device_cursors (
 device_id CHAR(36) NOT NULL,
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 last_pulled_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (device_id,tenant_id,branch_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Isolated sync inventory projection for transaction and replay tests.
-- NOT wired to FOON merchant stock; requires explicit provisioning per branch/item.
CREATE TABLE IF NOT EXISTS foon_sync_inventory_projection (
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 item_id CHAR(36) NOT NULL,
 quantity BIGINT UNSIGNED NOT NULL,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (tenant_id,branch_id,item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Staging-only local receipt ledger. Never treats a raw HTTP success as an ACK.
CREATE TABLE IF NOT EXISTS foon_sync_push_acknowledgments (
 device_id CHAR(36) NOT NULL,
 event_id CHAR(36) NOT NULL,
 tenant_id CHAR(36) NOT NULL,
 branch_id CHAR(36) NOT NULL,
 payload_digest CHAR(64) NOT NULL,
 next_version BIGINT UNSIGNED NOT NULL,
 signature VARCHAR(128) NOT NULL,
 acknowledged_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(device_id,event_id),
 KEY idx_foon_sync_ack_scope(tenant_id,branch_id,acknowledged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
