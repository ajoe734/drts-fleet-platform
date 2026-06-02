-- ASSIST-FF: ops.assistant.enabled per-realm feature flag (default off)
-- Controls the ops-console LLM assistant widget visibility and backend
-- availability. This is a toggle, not a credential; it defaults disabled and is
-- surfaced read-only in the ops-console /feature-flags registry.

INSERT INTO admin.feature_flags (flag_key, enabled, description, tenant_id, updated_at)
VALUES
  ('ops.assistant.enabled', false, 'Enable ops console LLM assistant widget + backend availability (per-realm toggle, not a credential)', NULL, NOW())
ON CONFLICT (flag_key, tenant_id) DO NOTHING;
