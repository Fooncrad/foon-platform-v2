CREATE TABLE IF NOT EXISTS restaurant_resources (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NULL,
 kind VARCHAR(40) NOT NULL,
 name VARCHAR(180) NOT NULL,
 status VARCHAR(32) NOT NULL,
 data JSON NOT NULL,
 lookup_key VARCHAR(180) NULL,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 archived BOOLEAN NOT NULL DEFAULT FALSE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_restaurant_resource_tenant(tenant_id,id),
 UNIQUE KEY uq_restaurant_resource_lookup(tenant_id,kind,lookup_key),
 KEY ix_restaurant_resource_list(tenant_id,kind,archived,created_at),
 CONSTRAINT fk_restaurant_resource_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_restaurant_resource_branch FOREIGN KEY(branch_id) REFERENCES branches(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_assets (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 mime_type VARCHAR(40) NOT NULL,
 bytes MEDIUMBLOB NOT NULL,
 size_bytes INT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_restaurant_asset_tenant(tenant_id),
 CONSTRAINT fk_restaurant_asset_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_orders (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 order_number BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
 tenant_id VARCHAR(36) NOT NULL,
 branch_id VARCHAR(36) NOT NULL,
 table_id VARCHAR(36) NULL,
 coupon_id VARCHAR(36) NULL,
 customer_name VARCHAR(180) NULL,
 customer_phone VARCHAR(40) NULL,
 customer_user_id VARCHAR(36) NULL,
 created_by VARCHAR(36) NOT NULL,
 request_key VARCHAR(36) NULL,
 request_fingerprint CHAR(64) NULL,
 channel ENUM('dine_in','takeaway','delivery') NOT NULL DEFAULT 'dine_in',
 status ENUM('new','preparing','ready','completed','cancelled') NOT NULL DEFAULT 'new',
 payment_status ENUM('unpaid','paid','refunded') NOT NULL DEFAULT 'unpaid',
 subtotal DECIMAL(12,2) NOT NULL,
 discount DECIMAL(12,2) NOT NULL DEFAULT 0,
 total DECIMAL(12,2) NOT NULL,
 currency CHAR(3) NOT NULL DEFAULT 'SAR',
 version INT UNSIGNED NOT NULL DEFAULT 1,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 UNIQUE KEY uq_restaurant_order_number(order_number),
 UNIQUE KEY uq_restaurant_order_tenant(tenant_id,id),
 UNIQUE KEY uq_restaurant_order_request(tenant_id,created_by,request_key),
 KEY ix_restaurant_order_list(tenant_id,branch_id,created_at),
 CONSTRAINT fk_restaurant_order_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_restaurant_order_customer FOREIGN KEY(tenant_id,customer_user_id) REFERENCES tenant_customers(tenant_id,user_id),
 CONSTRAINT fk_restaurant_order_creator FOREIGN KEY(created_by) REFERENCES users(id),
 CONSTRAINT fk_restaurant_order_branch FOREIGN KEY(branch_id) REFERENCES branches(id),
 CONSTRAINT fk_restaurant_order_table FOREIGN KEY(tenant_id,table_id) REFERENCES restaurant_resources(tenant_id,id),
 CONSTRAINT fk_restaurant_order_coupon FOREIGN KEY(tenant_id,coupon_id) REFERENCES restaurant_resources(tenant_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_order_items (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 order_id VARCHAR(36) NOT NULL,
 menu_item_id VARCHAR(36) NOT NULL,
 item_name VARCHAR(180) NOT NULL,
 quantity INT UNSIGNED NOT NULL,
 unit_price DECIMAL(12,2) NOT NULL,
 line_total DECIMAL(12,2) NOT NULL,
 CONSTRAINT fk_restaurant_line_order FOREIGN KEY(tenant_id,order_id) REFERENCES restaurant_orders(tenant_id,id),
 CONSTRAINT fk_restaurant_line_menu FOREIGN KEY(tenant_id,menu_item_id) REFERENCES restaurant_resources(tenant_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_audit_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 actor_user_id VARCHAR(36) NOT NULL,
 action VARCHAR(80) NOT NULL,
 resource_id VARCHAR(36) NULL,
 metadata JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_restaurant_audit(tenant_id,created_at),
 CONSTRAINT fk_restaurant_audit_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id),
 CONSTRAINT fk_restaurant_audit_actor FOREIGN KEY(actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
