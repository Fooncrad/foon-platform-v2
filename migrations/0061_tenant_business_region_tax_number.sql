ALTER TABLE tenant_business_profiles
 ADD COLUMN region VARCHAR(120) NULL AFTER country_code,
 ADD COLUMN tax_number VARCHAR(64) NULL AFTER currency;
