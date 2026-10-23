"""SQLite-only authorization regression checks; not a MariaDB integration test.

Run: python3 scripts/test_sync_device_live_membership_sql.py
This extracts the exact query from the production JS module and tests isolation
using synthetic users, branches, tenants, and roles. No production DB access.
"""
import sqlite3
import unittest
import re
from pathlib import Path

text = (Path(__file__).parents[1] / "lib/platform/bidirectional-sync-device-auth.mjs").read_text()
match = re.search(r'"(SELECT 1 AS permitted FROM memberships m .*? LIMIT 1)"', text)
if not match:
    raise RuntimeError("Live membership authorization SQL not found")
query = match.group(1)
SCHEMA = """CREATE TABLE memberships(user_id TEXT,tenant_id TEXT,status TEXT,role TEXT);
CREATE TABLE users(id TEXT,status TEXT);
CREATE TABLE tenants(id TEXT,status TEXT);
CREATE TABLE branches(id TEXT,tenant_id TEXT,enabled INT);
CREATE TABLE platform_admins(user_id TEXT,enabled INT);"""
branch, actor, tenant = "branch-a", "actor-a", "tenant-a"

def db():
    c = sqlite3.connect(":memory:")
    c.executescript(SCHEMA)
    c.execute("INSERT INTO memberships VALUES (?,?,?,?)", (actor, tenant, "active", "owner"))
    c.execute("INSERT INTO users VALUES (?,?)", (actor, "active"))
    c.execute("INSERT INTO tenants VALUES (?,?)", (tenant, "active"))
    c.execute("INSERT INTO branches VALUES (?,?,?)", (branch, tenant, 1))
    return c

def allowed(c):
    return c.execute(query, (branch, actor, tenant)).fetchone() is not None

class Checks(unittest.TestCase):
    def test_owner(self):
        self.assertTrue(allowed(db()))
    def test_manager(self):
        c = db(); c.execute("UPDATE memberships SET role='manager'"); self.assertTrue(allowed(c))
    def test_revoked(self):
        c = db(); c.execute("UPDATE memberships SET status='revoked'"); self.assertFalse(allowed(c))
    def test_waiter(self):
        c = db(); c.execute("UPDATE memberships SET role='waiter'"); self.assertFalse(allowed(c))
    def test_user_disabled(self):
        c = db(); c.execute("UPDATE users SET status='disabled'"); self.assertFalse(allowed(c))
    def test_tenant_disabled(self):
        c = db(); c.execute("UPDATE tenants SET status='inactive'"); self.assertFalse(allowed(c))
    def test_branch_disabled(self):
        c = db(); c.execute("UPDATE branches SET enabled=0"); self.assertFalse(allowed(c))
    def test_cross_tenant_branch(self):
        c = db(); c.execute("UPDATE branches SET tenant_id='tenant-b'"); self.assertFalse(allowed(c))
    def test_cross_tenant_membership(self):
        c = db(); c.execute("UPDATE memberships SET tenant_id='tenant-b'"); self.assertFalse(allowed(c))
    def test_platform_admin_enabled(self):
        c = db(); c.execute("INSERT INTO platform_admins VALUES (?,?)", (actor, 1)); self.assertFalse(allowed(c))
    def test_platform_admin_disabled(self):
        c = db(); c.execute("INSERT INTO platform_admins VALUES (?,?)", (actor, 0)); self.assertTrue(allowed(c))
    def test_missing_membership(self):
        c = db(); c.execute("DELETE FROM memberships"); self.assertFalse(allowed(c))

    def test_revoke_after_success_same_connection(self):
        c = db()
        self.assertTrue(allowed(c))
        c.execute("UPDATE memberships SET status='revoked'")
        self.assertFalse(allowed(c))

    def test_demotion_after_success_same_connection(self):
        c = db()
        self.assertTrue(allowed(c))
        c.execute("UPDATE memberships SET role='cashier'")
        self.assertFalse(allowed(c))

    def test_platform_admin_activation_after_success(self):
        c = db()
        self.assertTrue(allowed(c))
        c.execute("INSERT INTO platform_admins VALUES (?,?)", (actor, 1))
        self.assertFalse(allowed(c))

    def test_foreign_tenant_owner_does_not_restore_revoked_membership(self):
        c = db()
        c.execute("UPDATE memberships SET status='revoked'")
        c.execute("INSERT INTO tenants VALUES ('tenant-b','active')")
        c.execute("INSERT INTO memberships VALUES (?,?,?,?)", (actor, "tenant-b", "active", "owner"))
        self.assertFalse(allowed(c))

    def test_enabled_platform_admin_not_masked_by_disabled_duplicate(self):
        c = db()
        c.execute("INSERT INTO platform_admins VALUES (?,?)", (actor, 0))
        c.execute("INSERT INTO platform_admins VALUES (?,?)", (actor, 1))
        self.assertFalse(allowed(c))

    def test_null_status_is_denied(self):
        c = db()
        c.execute("UPDATE users SET status=NULL")
        self.assertFalse(allowed(c))

    def test_foreign_actor_owner_cannot_reuse_device(self):
        c = db()
        c.execute("INSERT INTO users VALUES ('actor-b','active')")
        c.execute("UPDATE memberships SET user_id='actor-b'")
        self.assertFalse(allowed(c))

    def test_same_tenant_other_branch_does_not_match_device(self):
        c = db()
        c.execute("UPDATE branches SET id='branch-b'")
        self.assertFalse(allowed(c))

    def test_null_role_is_denied(self):
        c = db()
        c.execute("UPDATE memberships SET role=NULL")
        self.assertFalse(allowed(c))

    def test_reactivated_membership_restores_access(self):
        c = db()
        c.execute("UPDATE memberships SET status='revoked'")
        self.assertFalse(allowed(c))
        c.execute("UPDATE memberships SET status='active'")
        self.assertTrue(allowed(c))

    def test_reenabled_branch_restores_access(self):
        c = db()
        c.execute("UPDATE branches SET enabled=0")
        self.assertFalse(allowed(c))
        c.execute("UPDATE branches SET enabled=1")
        self.assertTrue(allowed(c))

if __name__ == "__main__":
    unittest.main(verbosity=2)
