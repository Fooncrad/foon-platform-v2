CREATE TABLE IF NOT EXISTS media_library_settings (
 account_type VARCHAR(32) NOT NULL PRIMARY KEY,
 max_files INT NOT NULL DEFAULT 30,
 max_storage_mb INT NOT NULL DEFAULT 50,
 max_file_mb INT NOT NULL DEFAULT 2,
 enabled TINYINT(1) NOT NULL DEFAULT 1,
 updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO media_library_settings(account_type,max_files,max_storage_mb,max_file_mb) VALUES
('customer',20,20,2),('owner',200,200,2),('manager',100,100,2),('staff',30,30,2),('admin',500,500,2);
CREATE TABLE IF NOT EXISTS user_media_library (
 id VARCHAR(36) NOT NULL PRIMARY KEY,
 user_id VARCHAR(36) NOT NULL,
 file_name VARCHAR(180) NOT NULL,
 mime_type VARCHAR(32) NOT NULL,
 image_data LONGBLOB NOT NULL,
 size_bytes INT UNSIGNED NOT NULL,
 created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX idx_user_media_library_user_created(user_id,created_at),
 CONSTRAINT fk_user_media_library_user FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
