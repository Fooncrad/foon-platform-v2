-- FOON V2 durable, tenant-scoped print queue.
-- Local print agents must authenticate and claim jobs atomically before printing.
CREATE TABLE IF NOT EXISTS restaurant_print_jobs (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 printer_id VARCHAR(36) NOT NULL,
 source_type VARCHAR(32) NOT NULL,
 source_id VARCHAR(80) NOT NULL,
 event_key VARCHAR(80) NOT NULL,
 payload_json JSON NOT NULL,
 status ENUM('pending','leased','printed','retry','failed','cancelled') NOT NULL DEFAULT 'pending',
 attempts INT UNSIGNED NOT NULL DEFAULT 0,
 max_attempts INT UNSIGNED NOT NULL DEFAULT 8,
 available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 lease_token VARCHAR(64) NULL,
 lease_expires_at DATETIME(3) NULL,
 printed_at DATETIME(3) NULL,
 last_error VARCHAR(500) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY uq_print_event (tenant_id,printer_id,event_key),
 KEY idx_print_claim (tenant_id,printer_id,status,available_at),
 KEY idx_print_recover (status,lease_expires_at),
 KEY idx_print_source (tenant_id,source_type,source_id),
 CONSTRAINT fk_print_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_print_attempts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 job_id VARCHAR(36) NOT NULL,
 attempt_number INT UNSIGNED NOT NULL,
 agent_id VARCHAR(80) NOT NULL,
 outcome ENUM('claimed','printed','failed','lease_expired') NOT NULL,
 detail VARCHAR(500) NULL,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 KEY idx_print_attempt_job (job_id,created_at),
 CONSTRAINT fk_print_attempt_job FOREIGN KEY (job_id) REFERENCES restaurant_print_jobs(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
