-- Per-combination galleries are separate from the product's four base images.
CREATE TABLE IF NOT EXISTS catalog_variant_images (
 id VARCHAR(36) PRIMARY KEY,
 tenant_id VARCHAR(36) NOT NULL,
 product_id VARCHAR(36) NOT NULL,
 variant_id VARCHAR(36) NOT NULL,
 image_url VARCHAR(1024) NOT NULL,
 sort_order INT NOT NULL DEFAULT 0,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY ix_variant_gallery (tenant_id,product_id,variant_id,sort_order),
 CONSTRAINT fk_variant_images_tenant FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
 CONSTRAINT fk_variant_images_product FOREIGN KEY(product_id) REFERENCES catalog_products(id) ON DELETE CASCADE,
 CONSTRAINT fk_variant_images_variant FOREIGN KEY(variant_id) REFERENCES catalog_variants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
