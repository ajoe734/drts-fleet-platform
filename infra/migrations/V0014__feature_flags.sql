-- W8-001A: Feature flags persistence table
-- Stores system-level feature flags with optional tenant-scoped overrides.

CREATE TABLE IF NOT EXISTS admin.feature_flags (
  flag_key    TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  description TEXT NOT NULL,
  tenant_id   TEXT,  -- NULL = global flag; non-NULL = tenant-specific override
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT feature_flags_key_tenant_unique UNIQUE (flag_key, tenant_id)
);

-- Seed default Phase 1 flags (global scope, tenant_id IS NULL)
INSERT INTO admin.feature_flags (flag_key, enabled, description, tenant_id, updated_at)
VALUES
  ('tenant-portal.booking',  true, 'Enable tenant portal booking management', NULL, NOW()),
  ('tenant-portal.billing',  true, 'Enable tenant portal billing views', NULL, NOW()),
  ('tenant-portal.reports',  true, 'Enable tenant portal report job submission', NULL, NOW()),
  ('tenant-portal.webhooks', true, 'Enable tenant portal webhook management', NULL, NOW()),
  ('ops-console.dispatch',   true, 'Enable ops console dispatch board', NULL, NOW()),
  ('ops-console.complaint',  true, 'Enable ops console complaint case management', NULL, NOW()),
  ('ops-console.callcenter', true, 'Enable ops console callcenter session views', NULL, NOW()),
  ('ops-console.reports',    true, 'Enable ops console report job management', NULL, NOW()),
  ('driver-app.tasks',       true, 'Enable driver app task lifecycle', NULL, NOW()),
  ('driver-app.earnings',    true, 'Enable driver app earnings read model', NULL, NOW()),
  ('driver-app.incidents',   true, 'Enable driver app incident reporting', NULL, NOW()),
  ('driver-app.shift',       false, 'Enable driver app shift/attendance tracking', NULL, NOW()),
  ('phase1.read-models',     true, 'Enable Phase 1 read model surfaces', NULL, NOW()),
  ('phase1.smoke-paths',     true, 'Enable Phase 1 smoke test endpoints', NULL, NOW())
ON CONFLICT (flag_key, tenant_id) DO NOTHING;
