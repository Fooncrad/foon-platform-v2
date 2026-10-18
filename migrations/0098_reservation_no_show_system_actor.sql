-- System initiated reservation transitions need an auditable event without
-- attributing the action to an owner or customer account.
ALTER TABLE restaurant_audit_events
 MODIFY COLUMN actor_user_id VARCHAR(36) NULL;
