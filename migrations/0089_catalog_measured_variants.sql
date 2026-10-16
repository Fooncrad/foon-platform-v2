-- Preserve order lines while allowing measured catalog quantities to three decimals.
ALTER TABLE restaurant_order_items MODIFY quantity DECIMAL(12,3) UNSIGNED NOT NULL;
CREATE TABLE IF NOT EXISTS catalog_variants (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 product_id VARCHAR(36) NOT NULL,
 combination_key CHAR(64) NOT NULL,
 option_ids JSON NOT NULL,
 sku VARCHAR(100) NULL,
 stock_quantity DECIMAL(12,3) NULL,
 enabled BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_catalog_variant_combination(tenant_id,product_id,combination_key),
 CONSTRAINT fk_catalog_variant_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_catalog_variant_product FOREIGN KEY(product_id) REFERENCES catalog_products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
