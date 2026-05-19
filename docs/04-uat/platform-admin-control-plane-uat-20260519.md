# Platform Admin Control Plane UAT

**Workflow family:** `WF-ADM-001`  
**Status:** Draft UAT scenario pack for Phase 1 v3 design-blueprint-completion wave  
**Owner:** Codex2  
**Reviewer:** Claude  
**Task:** `ADM-UAT-001`  
**Date:** 2026-05-19  
**Companion automation:** `tests/e2e/E2E-011-platform-admin-control-plane.sh` (pending implementation; planning doc still allows `E2E-010` if numbering decision changes)

---

## 1. Gate framing

```text
Workflow family: WF-ADM-001
Business flow: Platform admin control plane
Current gate read: HOLD
Verification path: This UAT doc + forthcoming E2E shell + platform-admin audit review
Evidence level: repo-local design / UI / contract verification
Non-claim: This document does not claim fresh staging execution, production rollout proof, or completed E2E evidence
Next action: Implement and run the companion E2E path, then promote the gate with captured audit evidence
```

`WF-ADM-001` is the platform-owned governance lane for tenant bootstrap, partner ingress control, pricing publication, rollout stage promotion, and rollback hold. It exists to prove that high-risk control-plane mutations stay auditable, role-gated, and non-bypassable from the UI.

The workflow is defined by the Phase 1 v3 directive:

```text
create tenant
→ enable modules
→ configure tenant quota
→ create partner entry
→ issue partner credential
→ configure adapter / switchboard
→ publish pricing / split version
→ set rollout stage sandbox / pilot / production
→ set rollback hold
→ audit trail review
```

## 2. Scope and sources

### In scope

- Tenant lifecycle controls on `apps/platform-admin-web/app/tenants/*`
- Partner entry and ingress credential controls on `apps/platform-admin-web/app/partners/*`
- Pricing publish and fee-plan publication on `apps/platform-admin-web/app/pricing/page.tsx`
- Rollout / rollback posture visible from tenant governance surfaces
- Audit verification on `apps/platform-admin-web/app/audit/page.tsx`

### Intentionally deferred from this task

- Adapter-registry detail validation and switchboard public-info / placard publication are part of the broader control-plane workflow, but this brief's net-new UAT pack is limited to tenant create, partner credential, pricing publish, and rollout-stage governance.
- Those surfaces should still be exercised by the future companion E2E where they materially gate the same promotion chain.

### Source anchors

- Directive workflow and acceptance: `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md` §3.8
- Wave planning / task ownership: `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- Platform admin tenant lifecycle UI: `apps/platform-admin-web/app/tenants/page.tsx`
- Partner entry and one-time plaintext credential behavior: `apps/platform-admin-web/app/partners/page.tsx`, `apps/platform-admin-web/app/partners/[entrySlug]/page.tsx`
- Pricing publication and effective-window controls: `apps/platform-admin-web/app/pricing/page.tsx`
- Audit inspection surface: `apps/platform-admin-web/app/audit/page.tsx`
- Contracts for tenant stage / rollback hold / audit records: `packages/contracts/src/index.ts`

### Explicit non-claims

- No claim of production deploy or production release governance. That belongs to `WF-PROD-001` and `WF-REL-001`.
- No claim that external partner callbacks or live partner traffic are proven. That belongs to `WF-FWD-001` / `WF-PARTNER-001`.
- No claim that human UAT rows below have already passed. This file defines the required pack and expected results.

## 3. Preconditions

| ID | Requirement | Notes |
| -- | ----------- | ----- |
| `PF-ADM-1` | Authenticated `platform_admin` account | Required for all positive control-plane mutations |
| `PF-ADM-2` | Secondary low-privilege account | Use `ops_manager` or equivalent non-platform-admin role for `403` checks |
| `PF-ADM-3` | Seed tenant or disposable test tenant code | Needed to verify create, stage promotion, and rollback hold |
| `PF-ADM-4` | Partner entry sandbox metadata | Needed to issue / revoke ingress credentials |
| `PF-ADM-5` | Audit log access | Required to verify every mutation is recorded |

## 4. Scenario matrix

| ID | Scenario | Role | Priority | Classification |
| -- | -------- | ---- | -------- | -------------- |
| `ADM-001` | Create tenant with modules and bootstrap quota | `platform_admin` | P1 | `REPO-LOCAL VERIFIED` |
| `ADM-002` | Low-privilege actor cannot create tenant or alter rollout controls | non-`platform_admin` | P1 | `REPO-LOCAL VERIFIED` |
| `ADM-003` | Create partner entry and issue ingress credential | `platform_admin` | P1 | `REPO-LOCAL VERIFIED` |
| `ADM-004` | Plaintext partner credential is only visible at issuance time | `platform_admin` | P1 | `REPO-LOCAL VERIFIED` |
| `ADM-005` | Publish pricing rule with versioned effective window | `platform_admin` | P1 | `REPO-LOCAL VERIFIED` |
| `ADM-006` | Invalid pricing publish window is blocked in UI | `platform_admin` | P1 | `REPO-LOCAL VERIFIED` |
| `ADM-007` | Promote tenant rollout stage and place tenant into rollback hold | `platform_admin` | P1 | `REPO-LOCAL VERIFIED` |
| `ADM-008` | Audit trail shows every high-risk mutation with actor and module lineage | `platform_admin` | P1 | `REPO-LOCAL VERIFIED` |

## 5. Detailed scenarios

### `ADM-001` Tenant create with modules and quota

**Goal**

Prove the platform side can bootstrap a new tenant with enabled modules, quota defaults, integration mode, and rollout metadata.

**Preconditions**

- `platform_admin` session active
- Unique tenant code prepared

**Steps**

1. Navigate to Platform Admin → Tenants.
2. Open `Create tenant`.
3. Enter tenant name and unique code.
4. Select enabled modules required for the pilot tenant.
5. Set quota values for active drivers, monthly bookings, and monthly API calls.
6. Set integration mode and optional bootstrap admin email / sandbox base URL.
7. Submit the create form.
8. Refresh the tenant roster and open the new tenant detail route if available.

**Expected**

- New tenant appears in the tenant roster.
- Tenant record shows the selected enabled modules and quota values.
- Initial rollout stage is visible and consistent with tenant lifecycle controls.
- No cross-tenant data leakage occurs while viewing the new tenant.
- Audit trail records tenant creation with `platform_admin` actor metadata.

### `ADM-002` Low-privilege actor cannot mutate high-risk controls

**Goal**

Prove high-risk control-plane mutations remain platform-admin only.

**Preconditions**

- Secondary non-`platform_admin` account available
- Existing tenant and partner entry available

**Steps**

1. Sign in as a lower-privilege actor.
2. Attempt to access tenant create, tenant activation / rollback-hold actions, pricing publish, and partner credential issuance routes.
3. Attempt the same actions via direct API requests if UI navigation is hidden but endpoints are reachable.

**Expected**

- UI does not expose privileged action controls, or the actions fail explicitly.
- API returns `403 Forbidden` for unauthorized mutation attempts.
- No protected state changes are persisted.
- Unauthorized attempts are still auditable where applicable.

### `ADM-003` Partner entry create and credential issuance

**Goal**

Prove the platform can create a governed partner entry before enabling ingress traffic.

**Preconditions**

- Existing tenant or program target for the entry
- Chosen auth mode requires ingress credentials

**Steps**

1. Navigate to Platform Admin → Partners.
2. Create a new partner entry with routing, auth mode, eligibility mode, and branding metadata.
3. Open the created entry detail page.
4. Review readiness indicators for routing, lifecycle, and credentials.
5. Trigger `Rotate credential` / issue credential.

**Expected**

- Entry appears in the partner roster with the configured tenant/program association.
- Readiness posture remains explicit before activation.
- Credential issuance succeeds and produces a new active key record.
- Audit trail records entry creation and credential issuance.

### `ADM-004` Partner credential plaintext shown only once

**Goal**

Prove ingress credentials follow one-time plaintext disclosure and then degrade to masked posture.

**Preconditions**

- A fresh credential has just been issued for an entry

**Steps**

1. Capture the plaintext credential shown immediately after issuance.
2. Refresh the page or navigate away and back to the partner entry detail route.
3. Inspect the credentials section again.
4. Revoke the issued credential if test cleanup requires rotation.

**Expected**

- Plaintext key material is shown only in the issuance response state.
- Subsequent views show only masked credential values and metadata such as `createdAt`, `lastUsedAt`, and source.
- Revocation changes credential posture without redisclosing plaintext.
- Audit trail records issue and revoke actions.

### `ADM-005` Pricing publish uses versioned governance

**Goal**

Prove pricing publication is versioned, bounded by effective dates, and not a silent in-place overwrite.

**Preconditions**

- At least one pricing rule exists in draft state, or a disposable draft can be created

**Steps**

1. Navigate to Platform Admin → Pricing.
2. Create or select a draft pricing rule with explicit version string.
3. Open the publish form.
4. Enter an effective start timestamp and optional end timestamp.
5. Confirm publish.
6. Refresh the pricing roster and any linked fee-plan view.

**Expected**

- Published pricing rule remains identifiable by rule ID and version.
- Effective window is stored and visible after publish.
- Publish action does not silently mutate unrelated historical versions.
- Audit trail records who published the rule and when.

### `ADM-006` Invalid pricing publish window is blocked

**Goal**

Prove UI validation prevents bypass of broken pricing promotion windows.

**Preconditions**

- Draft pricing rule available

**Steps**

1. Open the publish form for a draft pricing rule.
2. Enter an invalid datetime in `effectiveFrom`, or enter `effectiveTo` earlier than `effectiveFrom`.
3. Attempt to confirm publish.

**Expected**

- UI blocks submission and shows the relevant validation error.
- No publish mutation is sent or persisted for invalid input.
- Draft remains unchanged until a valid window is supplied.

### `ADM-007` Rollout stage promotion and rollback hold

**Goal**

Prove tenant rollout posture is explicit across `sandbox`, `pilot`, `production`, and `rollback_hold`, and cannot be advanced casually.

**Preconditions**

- Disposable tenant exists

**Steps**

1. Open the tenant roster and verify current rollout stage.
2. Promote the tenant through the intended rollout path supported by the UI / detail route.
3. Confirm the tenant appears under the expected stage filter (`sandbox`, `pilot`, or `production`).
4. Trigger the rollback-hold action.
5. Refresh the roster and apply the `rollback_hold` filter.

**Expected**

- Tenant stage changes are visible in the roster and filter counts.
- Rollback-hold state is visually distinct from ordinary active / paused posture.
- UI does not provide a hidden shortcut that skips stage governance.
- Audit trail records both promotion and rollback-hold mutations.

### `ADM-008` Audit lineage across the full control-plane chain

**Goal**

Prove tenant create, partner entry, credential issuance, pricing publish, rollout promotion, and rollback hold all remain reviewable from the platform audit surface.

**Preconditions**

- Run `ADM-001`, `ADM-003`, `ADM-005`, and `ADM-007` using traceable test identifiers

**Steps**

1. Open Platform Admin → Audit.
2. Filter by the relevant module names and actor type.
3. Locate audit rows for tenant creation, partner entry creation, credential issuance/revocation, pricing publish, rollout promotion, and rollback hold.
4. Expand selected rows to verify resource ID and request metadata.

**Expected**

- Every mutation from the workflow chain appears in audit history.
- Audit rows preserve actor type, module name, action name, resource type, and resource ID.
- Filtered review is sufficient to reconstruct the control-plane change sequence.
- Missing audit entries are a release-blocking failure for `WF-ADM-001`.

## 6. Pass / fail rules

`WF-ADM-001` can only move beyond `HOLD` when all of the following are true:

1. `ADM-001` through `ADM-008` have either fresh human execution evidence or companion automated proof.
2. Every high-risk mutation is visible in audit history.
3. Low-privilege mutation attempts are denied with explicit authorization failure.
4. Partner credential plaintext is never redisplayed after issuance.
5. Pricing publication remains versioned and rollback-aware rather than mutable in place.
6. Rollout stage promotion cannot bypass governance from the UI.

Any failure in items 2 through 6 is a P1 gate failure.

## 7. Evidence capture checklist

- Tenant IDs / codes used during `ADM-001` and `ADM-007`
- Partner entry slug and issued credential key ID from `ADM-003` / `ADM-004`
- Pricing rule ID, version, and effective window from `ADM-005`
- Audit row IDs for each mutation in `ADM-008`
- Screenshot or log evidence that unauthorized attempts in `ADM-002` return `403`

## 8. Verification note for this task

This task produced the UAT scenario pack only. No executable E2E or live staging run was part of `ADM-UAT-001`, so the gate remains documentation-complete but execution-pending until `WF-ADM-001-E2E` lands and evidence is captured.
