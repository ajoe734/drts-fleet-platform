# Platform Admin Control Plane — UAT

**Date**: 2026-05-19 (date stamped to align with directive; reconciled commit 2026-05-22)
**Authority**: directive §I `ADM-001` — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
**Workflow family**: `WF-ADM-001`
**Executable proof**: `tests/e2e/E2E-011-platform-admin-control-plane.sh` (driven by `PH1GC-E2E-011`)
**Runtime surface**: `apps/platform-admin-web/`

This UAT codifies the human-runnable acceptance scenarios for the Platform Admin control plane — the operator surface that creates and configures tenants, partner entries, adapters, pricing, feature flags, rollout stages, and rollback holds. Each scenario maps to a mutation step in the spec and an audit assertion.

---

## 1. Pre-conditions

- A platform-admin role exists with full control-plane permissions.
- A non-platform-admin role exists (e.g., tenant-admin, finance) for RBAC negative paths.
- A clean tenant slot is available (no existing tenant with the test slug).
- The admin web UI is reachable and the audit log is writable.

---

## 2. Happy-path scenarios

Eleven scenarios mapping to directive §I coverage.

### `UAT-ADM-001` — Tenant create

1. Platform admin logs in.
2. Creates a new tenant `acme-co` with display name, locale, currency, and time zone.

**Assert**: tenant row created; tenant scope isolation immediately active (no cross-tenant data leakage); audit row captures the creation with admin user id, timestamp, and tenant id.

### `UAT-ADM-002` — Module enablement

1. For the new tenant, enable modules: booking, dispatch, driver-app, partner-booking, reporting.
2. Optionally disable a module (e.g., partner-booking) for a different test tenant.

**Assert**: each module enable / disable creates an audit row; disabled modules' API endpoints return 404 / module_disabled for that tenant; enabled modules respond normally.

### `UAT-ADM-003` — Tenant quotas

1. Configure a quota policy for the tenant: e.g., monthly booking count ≤ 1000.
2. Update the ceiling to 500.

**Assert**: both writes are audited; the quota policy is visible to `WF-TGV-001` consumers and to `WF-FIN-GOV-001` billing.

### `UAT-ADM-004` — Partner entry setup

1. Create a partner entry under the new tenant: `entrySlug = test-partner`, brand metadata, issuer pointer.
2. Update branding (e.g., logo URL) and verify the change.

**Assert**: partner entry is created with the correct `(tenantSlug, entrySlug)` identity; updates are audited; the entry is reachable via `apps/partner-booking-web/[tenantSlug]/[entrySlug]` once a verifier is wired.

### `UAT-ADM-005` — Partner credential issue / revoke

1. Issue a credential for the partner entry (e.g., issuer sandbox API key reference).
2. Revoke it.

**Assert**: issue and revoke both produce audit rows; revocation immediately blocks new eligibility verifications against that credential; the masked credential reference is the only form persisted (per `WF-PARTNER-001` §3.2).

### `UAT-ADM-006` — Adapter / switchboard health

1. View the adapter health dashboard.
2. Toggle an adapter into maintenance mode.

**Assert**: maintenance mode is audited; in-flight requests complete; new requests are queued or fast-failed per the adapter's documented behavior; toggling back to normal is also audited.

### `UAT-ADM-007` — Pricing publish

1. Publish a new pricing version for a booking class (e.g., `airport-transfer-economy`).
2. Verify the version is recorded.

**Assert**: pricing is versioned (carries a non-null `version` field); the version is audited; downstream booking quotes reflect the new pricing.

### `UAT-ADM-008` — Feature flag toggle

1. Toggle a tenant-scoped feature flag on, observe in the runtime; toggle off.

**Assert**: both transitions are audited; the runtime reflects the change within the SLA (≤30 seconds for cached flags).

### `UAT-ADM-009` — Rollout stage promotion

1. Promote a rollout from `staging` to `pre-prod`.
2. Promote from `pre-prod` to `production` (subject to UAT-ADM-010 below).

**Assert**: each promotion is audited with the source stage, target stage, admin user id, and timestamp.

### `UAT-ADM-010` — Rollback hold blocks production promote

1. Set a rollback hold on the production stage.
2. Attempt to promote a rollout to production (per UAT-ADM-009 step 2).

**Assert**: the promotion attempt is rejected with `production_rollback_hold_active` reason code. The attempt itself is audited (rejected attempts are first-class audit subjects). Removing the hold (separately audited) allows the promotion.

### `UAT-ADM-011` — Audit verification end-to-end

1. After running UAT-ADM-001 through 010, fetch the audit log filtered by the test session.

**Assert**: every mutation from UAT-ADM-001 through UAT-ADM-010 appears in the audit log. Rejected attempts (UAT-ADM-010 first attempt) also appear. The audit log entries carry admin user id, action, target resource, before / after values (or rejection reason), and a monotonic timestamp ordering.

---

## 3. RBAC negative scenarios

At minimum two negative-path scenarios are required (per directive §B `E2E-011` acceptance).

### `UAT-ADM-N01` — Non-admin tenant-create blocked

1. Non-platform-admin role attempts to create a new tenant.

**Assert**: API returns 403; an audit row records the attempt with the attacker user id; no tenant is created.

### `UAT-ADM-N02` — Non-admin pricing publish blocked

1. Non-platform-admin role attempts to publish a pricing version.

**Assert**: API returns 403; audit row records the attempt; no pricing version is created.

### `UAT-ADM-N03` (optional but recommended) — Cross-tenant control-plane access blocked

1. A tenant-scoped admin role for Tenant A attempts to modify Tenant B's configuration.

**Assert**: API returns 404 / not_found (to avoid existence leakage) or 403 depending on the resource; audit captures the attempt.

---

## 4. Acceptance criteria for `WF-ADM-001` gate-read

To set the gate read to `PASS (repo-local evidence)`:

- All happy-path UAT-ADM-001 through UAT-ADM-011 pass against the repo-local test environment.
- All negative scenarios UAT-ADM-N01, UAT-ADM-N02 pass.
- `tests/e2e/E2E-011-platform-admin-control-plane.sh` runs end-to-end with hard fail on missing seed.
- Closeout report (directive §7 format) is filed.

To uplift to `PASS (live staging evidence)`:

- Same scenarios pass against a staging environment with real-tenant data.
- Audit log persistence is verified across at least one supervisor restart.
- Rollback-hold behavior is verified against a production-shaped rollout pipeline (no actual production traffic).

---

## 5. Out of scope

- Production deploy mechanics (`WF-PROD-001` — `PH1GC-PROD-001`).
- Per-tenant onboarding playbook (`docs/03-runbooks/tenant-onboarding-rollout-runbook.md`).
- Pricing math / discount stacking (lives in `WF-FIN-001` baseline).
- Adapter implementation details (each adapter has its own runbook).
