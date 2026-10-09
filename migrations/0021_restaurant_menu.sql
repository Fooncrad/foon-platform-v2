-- Restaurant and cafe menu catalog. No demo products are inserted.
CREATE TABLE IF NOT EXISTS restaurant_menu_categories (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 name VARCHAR(180) NOT NULL,
 sort_order INT NOT NULL DEFAULT 0,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_restaurant_menu_categories_tenant (tenant_id,enabled,sort_order),
 CONSTRAINT fk_restaurant_menu_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS restaurant_menu_items (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 category_id VARCHAR(36) NOT NULL,
 name VARCHAR(180) NOT NULL,
 description TEXT NULL,
 price DECIMAL(12,2) NOT NULL DEFAULT 0,
 currency CHAR(3) NOT NULL DEFAULT 'SAR',
 image_url VARCHAR(1024) NULL,
 sort_order INT NOT NULL DEFAULT 0,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_restaurant_menu_items_category (tenant_id,category_id,enabled,sort_order),
 CONSTRAINT fk_restaurant_menu_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
 CONSTRAINT fk_restaurant_menu_items_category FOREIGN KEY (category_id) REFERENCES restaurant_menu_categories(id) ON DELETE RESTRICT,
 CONSTRAINT ck_restaurant_menu_items_price CHECK (price >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
