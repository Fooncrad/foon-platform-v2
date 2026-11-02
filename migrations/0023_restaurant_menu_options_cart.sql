-- Restaurant menu extensions: safe additive migration; no existing rows deleted.
CREATE TABLE IF NOT EXISTS restaurant_menu_item_images (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 item_id VARCHAR(36) NOT NULL,
 image_url VARCHAR(1024) NOT NULL,
 sort_order INT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_rmi_item (tenant_id,item_id,sort_order),
 CONSTRAINT fk_rmi_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_rmi_item FOREIGN KEY (item_id) REFERENCES restaurant_menu_items(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_menu_option_groups (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 item_id VARCHAR(36) NOT NULL,
 name VARCHAR(180) NOT NULL,
 selection_type ENUM('single','multiple') NOT NULL DEFAULT 'single',
 required BOOLEAN NOT NULL DEFAULT FALSE,
 min_select INT NOT NULL DEFAULT 0,
 max_select INT NOT NULL DEFAULT 1,
 sort_order INT NOT NULL DEFAULT 0,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 KEY ix_rmog_item (tenant_id,item_id,sort_order),
 CONSTRAINT fk_rmog_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_rmog_item FOREIGN KEY (item_id) REFERENCES restaurant_menu_items(id) ON DELETE CASCADE,
 CONSTRAINT ck_rmog_range CHECK (min_select >= 0 AND max_select >= min_select)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_menu_option_values (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 group_id VARCHAR(36) NOT NULL,
 name VARCHAR(180) NOT NULL,
 price_delta DECIMAL(12,2) NOT NULL DEFAULT 0,
 sort_order INT NOT NULL DEFAULT 0,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 KEY ix_rmov_group (tenant_id,group_id,sort_order),
 CONSTRAINT fk_rmov_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_rmov_group FOREIGN KEY (group_id) REFERENCES restaurant_menu_option_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_customer_carts (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 user_id VARCHAR(36) NULL,
 guest_token_hash CHAR(64) NULL,
 status ENUM('active','converted','abandoned') NOT NULL DEFAULT 'active',
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY ix_rcc_user (tenant_id,user_id,status),
 KEY ix_rcc_guest (tenant_id,guest_token_hash,status),
 CONSTRAINT fk_rcc_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_rcc_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
 CONSTRAINT ck_rcc_identity CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS restaurant_customer_cart_items (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 cart_id VARCHAR(36) NOT NULL,
 item_id VARCHAR(36) NOT NULL,
 quantity INT NOT NULL DEFAULT 1,
 notes VARCHAR(1000) NULL,
 selected_options JSON NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_rcci_cart (cart_id),
 CONSTRAINT fk_rcci_cart FOREIGN KEY (cart_id) REFERENCES restaurant_customer_carts(id) ON DELETE CASCADE,
 CONSTRAINT fk_rcci_item FOREIGN KEY (item_id) REFERENCES restaurant_menu_items(id) ON DELETE RESTRICT,
 CONSTRAINT ck_rcci_quantity CHECK (quantity BETWEEN 1 AND 999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
