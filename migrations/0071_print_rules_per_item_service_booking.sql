-- FOON V2: per-item, per-service and per-reservation print routing.
-- Rules may be configured at tenant, branch, category or individual resource level.
CREATE TABLE IF NOT EXISTS restaurant_print_rules (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 printer_id VARCHAR(36) NOT NULL,
 target_type ENUM('all','menu_category','menu_item','service','reservation','waitlist','order','invoice','table','waiter_call') NOT NULL,
 target_id VARCHAR(80) NULL,
 trigger_event VARCHAR(64) NOT NULL,
 template_key VARCHAR(80) NOT NULL DEFAULT 'default',
 copies TINYINT UNSIGNED NOT NULL DEFAULT 1,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 priority SMALLINT NOT NULL DEFAULT 100,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 KEY idx_print_rules_match (tenant_id,branch_id,target_type,target_id,trigger_event,enabled),
 KEY idx_print_rules_printer (tenant_id,printer_id),
 CONSTRAINT fk_print_rule_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
 CONSTRAINT chk_print_rule_copies CHECK (copies BETWEEN 1 AND 10)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Each rule's event must generate a deterministic event_key in restaurant_print_jobs
-- to avoid duplicate printing when the same order or booking is retried.
