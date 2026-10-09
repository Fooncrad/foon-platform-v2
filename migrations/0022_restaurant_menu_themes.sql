-- Four restaurant/cafe menu layouts inspired by the reference theme families.
CREATE TABLE IF NOT EXISTS restaurant_menu_appearance (
 tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
 template_key ENUM('classic','modern','minimal','sufra') NOT NULL DEFAULT 'sufra',
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 CONSTRAINT fk_restaurant_menu_appearance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
