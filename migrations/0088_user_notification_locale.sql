-- Persist the account language for transactional mail, independent of browser sessions.
ALTER TABLE users ADD COLUMN default_locale ENUM('ar','en','fr') NOT NULL DEFAULT 'ar';
