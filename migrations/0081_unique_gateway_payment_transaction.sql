-- One provider transaction must never settle two FOON orders, even across tenants or branch scopes.
-- Existing duplicates require investigation; this migration never deletes or rewrites financial records.
CREATE UNIQUE INDEX uq_payment_global_transaction
ON tenant_payment_attempts(provider,mode,provider_payment_id);
