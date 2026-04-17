# FBP-014A BFF & Frontend Handoff Packet

**Sidecar Task:** `FBP-014A-SIDECAR-BFF-HANDOFF`  
**Parent Task:** `FBP-014A`  
**Helper Kind:** `bff_handoff_packet`  
**Prepared by:** Codex  
**Assigned Reviewer:** Codex2  
**Date:** 2026-04-16 (UTC)  
**Status:** READY FOR REVIEW

---

## 1. Purpose

This sidecar translates the `FBP-014A` cross-surface E2E scaffold into a BFF/frontend handoff
packet for downstream consumers and reviewers.

It answers four practical questions:

1. Which frontend and operator journeys are concretely exercised by the `FBP-014A` scaffold,
   rather than only described in umbrella planning?
2. Which canonical BFF/API surfaces and fixture inputs does each scenario depend on?
3. Which gaps remain manual-only, environment-gated, or deferred to `FBP-014B` instead of being
   treated as completed live evidence?
4. What should reviewer Codex2 verify before this support packet is closed?

This document is support-only. It does not change canonical truth, runtime behavior, contracts,
registry state, or governance state.

---

## 2. Shared-Truth Baseline

The baseline below comes from the current shared coordination files plus the already-landed parent
support artifacts:

- `current-work.md` records parent task `FBP-014A` as `review_approved`, with the explicit note
  that the scaffold is ready, AC-1 through AC-8 are checked, offline verification passed via
  `bash -n` plus `./tests/e2e/run-e2e.sh --dry-run`, and live staging evidence remains deferred to
  `FBP-014B` after `FBP-013` closeout.
- `current-work.md` records this sidecar task as `review`, Owner=`Codex`, Reviewer=`Codex2`, with
  the stated goal of preparing BFF query-gap, operator-journey, and frontend handoff materials.
- `ai-status.json` records this sidecar as scoped to
  `support/sidecars/FBP-014A/FBP-014A-SIDECAR-BFF-HANDOFF.md` and keeps the formal dependency set
  aligned to `FBP-006`, `FBP-008`, `FBP-009`, `FBP-011`, and `FBP-012`.
- `ai-activity-log.jsonl` records the owner churn and final availability-first reassignment back to
  `Codex`, then the formal `start` transition at `2026-04-16T03:43:25Z`.
- `docs/04-uat/fbp-014a-e2e-matrix.md` is the parent matrix artifact that freezes the scenario
  topology, guardrails, acceptance snapshot, and dry-run verification posture.
- `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md` is the parent evidence pack
  that maps AC-1 through AC-8 to concrete scaffold artifacts.
- `support/sidecars/FBP-014/FBP-014-SIDECAR-BFF-HANDOFF.md` already freezes the umbrella-level
  integrated-E2E entry matrix and guardrails.
- `support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md` already freezes the tenant-side
  `tenant-commute-hub` cutover boundary and the “no repo-B local authority” rule that still applies
  here.

Important framing:

- This packet documents the **frontend/BFF implications of the scaffold**, not a live staging
  completion report.
- It is valid to reference operator journeys and API routes, but not to claim that `FBP-014A`
  already completed rollout-grade evidence capture.
- `FBP-014B` remains the live integrated evidence run after `FBP-013` finishes closeout.

---

## 3. What `FBP-014A` Adds Beyond The Umbrella `FBP-014` Handoff

`FBP-014` froze the integrated topology and guardrails. `FBP-014A` turns that topology into
scenario scripts, fixtures, and chain assertions.

| Question                          | `FBP-014` umbrella baseline                                                   | `FBP-014A` scaffold outcome                                                                                                          | Frontend/BFF implication                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Owned happy-path coverage         | Booking -> dispatch -> driver -> billing/audit must be stitched end to end    | `E2E-001-enterprise-dispatch.sh` now encodes the chain and records `bookingId -> dispatchJobId -> taskId -> invoiceId`               | Frontend/ops consumers can treat this as the canonical owned-flow scaffold, not as a vague future target           |
| Forwarded-order boundary          | Forwarded mirror lifecycle is a separate scenario, not the primary happy path | `E2E-002-forwarded-order.sh` checks `routeLocked`, `sourcePlatform`, accept flow, and absence of an owned `dispatch_assignment`      | Driver/ops consumers must keep forwarded tasks visually distinct and must not remap them into owned dispatch truth |
| Cross-tenant safety               | Integrated suite must prove tenant attribution and no cross-tenant leak       | `E2E-004-tenant-attribution.sh` creates a tenant, books under it, checks ops attribution, then hard-fails on leakage into `TEN_ACME` | Tenant and platform-admin consumers now have an explicit scaffold for multi-tenant isolation validation            |
| Phone booking / compliance export | The umbrella points to smoke/UAT/runbook anchors                              | `E2E-003` stays manual-only in the matrix because CTI session + recording callback remain environment-gated                          | Call-center/compliance consumers must not assume the scaffold already automated this leg                           |
| Evidence posture                  | Integrated evidence belongs to `FBP-014B` after `FBP-013`                     | `FBP-014A` explicitly stops at dry-run/static scaffold verification                                                                  | Reviewers must evaluate this as support scaffolding, not as final rollout evidence                                 |

---

## 4. Canonical Scenario-to-Surface Handoff Matrix

The matrix below compresses the scaffold into the consumer-facing routes, API surfaces, fixtures,
and continuity chain each scenario depends on.

| Scenario                                             | Primary UI / operator journey                                                                                       | Actor chain                                                                                   | Canonical API / BFF surface                                                                                                                                                                                          | Core scaffold inputs                                                                                                                                                                                 | Continuity / assertion chain                                                | Handoff note                                                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `E2E-001` enterprise dispatch full cycle             | `tenant-commute-hub` booking routes -> Ops `/dispatch` -> Driver task lifecycle -> tenant billing -> platform audit | `tenant_admin` -> `platform_admin` -> `driver_user` -> `tenant_admin` -> `platform_admin`     | `POST/GET /api/tenant/bookings`, `GET /api/dispatch/tasks`, `GET /api/dispatch/tasks/:id/candidates`, `POST /api/dispatch/assign`, `GET/POST /api/driver/tasks*`, `POST/GET /api/tenant/invoices*`, `GET /api/audit` | `e2e-booking-enterprise.json`, `e2e-dispatch-assign.json`, `e2e-driver-accept.json`, `e2e-driver-depart.json`, `e2e-driver-arrived-pickup.json`, `e2e-driver-start.json`, `e2e-driver-complete.json` | `bookingId -> dispatchJobId -> taskId -> invoiceId`, plus audit entry count | This is the primary owned happy path. Booking completion may warn rather than fail when async propagation lags.  |
| `E2E-002` forwarded-order mirror lifecycle           | Driver route-aware forwarded-task visibility -> accept -> ops negative check                                        | `driver_user` -> `platform_admin`                                                             | `GET /api/driver/tasks`, `GET /api/driver/tasks/:taskId`, `POST /api/driver/tasks/:taskId/accept`, `GET /api/dispatch/tasks`                                                                                         | `e2e-driver-accept.json`                                                                                                                                                                             | `forwardedTaskId`, `routeLocked`, `sourcePlatform`, no owned dispatch job   | Forwarded tasks remain mirror semantics. Missing forwarded seed data is a graceful skip, not a scaffold failure. |
| `E2E-003` phone booking to compliance export         | Call-center intake -> recording callback -> driver completion -> compliance/report export                           | manual operator chain                                                                         | `POST /api/call-center/orders`, recording callback webhook, reporting/export surfaces                                                                                                                                | Reserved helper fixtures: `e2e-phone-booking.json`, `e2e-report-compliance.json`                                                                                                                     | `callId -> recordingId -> export row`                                       | Manual-only in the scaffold. No automated browser/API flow should be inferred from this packet.                  |
| `E2E-004` tenant attribution and cross-tenant safety | Platform Admin tenant create -> new-tenant booking -> ops attribution check -> TEN_ACME leak check                  | `platform_admin` -> `tenant_admin(newTenant)` -> `platform_admin` -> `tenant_admin(TEN_ACME)` | `POST/GET /api/platform-admin/tenants`, `POST/GET /api/tenant/bookings`, `GET /api/dispatch/tasks`                                                                                                                   | `e2e-tenant-create.json`, `e2e-booking-enterprise.json`                                                                                                                                              | `newTenantId -> bookingId`, plus `crossTenantLeakDetected=false`            | This is the explicit multi-tenant security scaffold. Leak detection is a hard failure, not a warning.            |

Interpretation rules:

- Tenant-side entry still means **`tenant-commute-hub` backed by `/api/tenant/*`**.
- Nothing in this matrix re-authorizes retired `apps/tenant-portal-web` routes.
- Nothing in this matrix authorizes repo-B local truth, Supabase direct reads, or frontend-side
  financial / dispatch authority.

---

## 5. Explicit Gaps, Deferred Items, And Environment-Gated Behavior

These are the material caveats that frontend/BFF consumers and reviewers must keep visible.

| Gap / caveat                                                                              | Current scaffold state                                                                                        | Consumer implication                                                                                                                      |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E-003` automation                                                                      | Manual-only in `docs/04-uat/fbp-014a-e2e-matrix.md`; requires live CTI session and recording callback webhook | Call-center/compliance teams must not describe this leg as automated coverage yet                                                         |
| Live staging evidence                                                                     | Deferred to `FBP-014B` after `FBP-013` closeout                                                               | This packet is not a substitute for rollout-grade evidence or staging screenshots/logs                                                    |
| Browser/UI automation                                                                     | The scaffold is API/header-driven via `tests/e2e/lib/helpers.sh`, not repo-B browser automation               | Frontend teams may use the route anchors here, but selector-level browser proof still belongs to a separate UI automation slice if needed |
| Empty dispatch queue / missing forwarded task / tenant-create response without `tenantId` | Explicit graceful-skip rules are built into `E2E-001`, `E2E-002`, and `E2E-004`                               | Missing seeded/live data is an environment-readiness issue, not a reason to invent local workaround logic                                 |
| Async completion propagation                                                              | `E2E-001` warns when booking status is not yet `completed` after driver completion                            | Consumers must preserve backend-owned async semantics and avoid hard-coding synchronous completion assumptions                            |
| Audit specificity                                                                         | `E2E-001` currently asserts audit entries exist, not a perfect UI-level audit render chain                    | Audit presence is scaffolded; richer audit evidence still belongs to final integrated evidence capture or a future helper slice           |

Reserved-but-not-primary inputs:

- `tests/e2e/fixtures/e2e-booking-airport.json`
- `tests/e2e/fixtures/e2e-phone-booking.json`
- `tests/e2e/fixtures/e2e-report-compliance.json`
- `tests/e2e/fixtures/e2e-tenant-module-enable.json`

These support future expansion or manual workflows; they do not mean the scaffold already covers
those routes end to end.

---

## 6. Frontend / Operator Journey Handoff

### 6.1 Tenant Booking Journey

- Start from `tenant-commute-hub`, not the retired internal tenant portal.
- Use canonical tenant booking routes and preserve the returned `bookingId` as the first stitched
  evidence ID.
- Treat booking state as backend-owned. The scaffold explicitly avoids local booking-truth
  workarounds when async propagation lags.

### 6.2 Ops Dispatch Journey

- Use the dispatch queue and candidates routes as the only assignment authority.
- Preserve `tenantId`, `dispatchJobId`, `driverId`, and `vehicleId` lineage through assignment.
- If the queue is empty in a given environment, treat that as data-readiness, not as permission to
  fabricate local dispatch state or bypass the ops console flow.

### 6.3 Driver Journey

- Owned-flow tasks must support the full lifecycle exercised in `E2E-001`:
  accept -> depart -> arrived_pickup -> start -> complete.
- Forwarded-flow tasks must preserve `routeLocked` and `sourcePlatform` semantics.
- Driver consumers must not coerce a forwarded task into an owned dispatch artifact; `E2E-002`
  exists specifically to catch that regression.

### 6.4 Billing And Audit Journey

- Billing remains backend-owned: invoice generation and invoice detail reads use tenant billing
  endpoints only.
- Audit reads remain platform-admin scoped and are used as evidence of state-write visibility, not
  as a frontend-side derived truth source.
- Do not compute invoice truth, settlement truth, or audit truth in the UI.

### 6.5 Platform Admin And Cross-Tenant Safety Journey

- Platform Admin creates the new tenant through `/api/platform-admin/tenants`.
- A tenant-admin for that new tenant performs the booking leg under the new `tenantId`.
- Ops must see the correct attribution, and `TEN_ACME` must not see the new tenant's booking.
- This isolation proof is part of the scaffold definition of done, not an optional nice-to-have.

---

## 7. Non-Negotiable Consumer Rules

Any frontend or operator consumer relying on this scaffold must preserve these rules:

- Keep tenant entry on `tenant-commute-hub` and `/api/tenant/*`.
- Keep repo B as a pure UI consumer with no local authority restored.
- Preserve canonical `/api/*` prefixes, `snake_case`, response envelopes, and POST idempotency
  semantics.
- Keep the owned enterprise-dispatch flow as the primary happy path; forwarded orders remain a
  separate mirror scenario.
- Treat billing, audit, and tenant isolation as backend-owned truth, not presentation-layer truth.
- If this scaffold exposes a real contract gap, reopen the correct authority/evidence task instead
  of patching around it in support notes or frontend code.

These rules are inherited from the already-frozen `FBP-006` and `FBP-014` handoff packets and stay
fully in force here.

---

## 8. Reviewer Checklist For Codex2

Codex2 should review this sidecar against the following points:

1. The packet stays support-only and does not modify canonical truth, runtime behavior, or the
   parent evidence pack.
2. The scenario matrix here matches the actual `FBP-014A` scaffold state recorded in
   `docs/04-uat/fbp-014a-e2e-matrix.md` and
   `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md`.
3. The packet keeps `tenant-commute-hub` as the only tenant-side entry point and does not re-open
   retired `apps/tenant-portal-web` usage.
4. The packet makes manual-only / environment-gated gaps explicit instead of silently implying live
   evidence completion.
5. The operator-journey and frontend-consumer rules remain aligned with the existing `FBP-006` and
   `FBP-014` guardrails: no local authority, no forwarded-order reinterpretation, and explicit
   cross-tenant safety.

If those checks pass, Codex2 can approve this sidecar and return it to Codex for `done` closeout
with `NO_COMMIT_REQUIRED=1`.

---

## 9. Handoff / Review / Closeout Commands

Owner handoff to Codex2:

```bash
AI_NAME=Codex ./scripts/ai-status.sh handoff FBP-014A-SIDECAR-BFF-HANDOFF Codex2 \
  "FBP-014A sidecar handoff packet ready in support/sidecars/FBP-014A/FBP-014A-SIDECAR-BFF-HANDOFF.md. It maps the E2E-001/002/004 scaffold to canonical tenant/ops/driver/billing/admin surfaces, keeps E2E-003 manual-only, records environment-gated skips and async caveats, and preserves the FBP-006/FBP-014 guardrails. Support artifact only; no canonical truth changes."
```

Reviewer approval:

```bash
AI_NAME=Codex2 \
REVIEW_FILE=support/sidecars/FBP-014A/FBP-014A-SIDECAR-BFF-HANDOFF.md \
REVIEW_NOTES_ZH='審查通過：handoff packet 正確把 FBP-014A scaffold 對 frontend/BFF 的實際邊界整理成可消費的路徑與 guardrail，E2E-001/002/004 的 surface chain 與 parent matrix/evidence pack 對齊，E2E-003 manual-only 與環境型 graceful-skip caveat 保持明示，且未把 retired tenant portal 或 repo-B local authority 寫回來。|回到 owner（Codex）以 NO_COMMIT_REQUIRED=1 做 done closeout。' \
./scripts/ai-status.sh approve FBP-014A-SIDECAR-BFF-HANDOFF \
  "Review approved. Handoff packet preserves the FBP-014A scaffold boundaries, manual-only gaps, and inherited tenant-commute-hub / no-local-authority guardrails without changing canonical truth."
```

Reviewer reopen:

```bash
AI_NAME=Codex2 ./scripts/ai-status.sh reopen FBP-014A-SIDECAR-BFF-HANDOFF \
  "packet needs revision: [specify scenario drift / retired-route confusion / evidence-anchor mismatch / support-scope violation]"
```

Owner closeout after approval:

```bash
AI_NAME=Codex NO_COMMIT_REQUIRED=1 ./scripts/ai-status.sh done FBP-014A-SIDECAR-BFF-HANDOFF \
  "Done: FBP-014A BFF/frontend handoff packet recorded the concrete scaffolded surface chain, explicit manual/deferred gaps, and downstream consumer rules without changing canonical truth."
```

---

## 10. Notes For Parent Owner / Parent Reviewer

1. Read this packet together with:
   `support/sidecars/FBP-014A/FBP-014A-E2E-SCAFFOLD-EVIDENCE-PACK.md`,
   `docs/04-uat/fbp-014a-e2e-matrix.md`,
   `support/sidecars/FBP-014/FBP-014-SIDECAR-BFF-HANDOFF.md`, and
   `support/sidecars/FBP-006/FBP-006-SIDECAR-BFF-HANDOFF.md`.
2. Treat `tests/e2e/run-e2e.sh --dry-run` and the current scaffold as topology proof, not as the
   final live evidence bundle.
3. If `FBP-014B` later needs richer browser/UI proof or exact audit-lineage screenshots, create a
   new helper or extend the evidence run; do not rewrite this support packet as though the scaffold
   had already delivered that proof.
4. If a new gap appears in the canonical surfaces, reopen the right parent authority/evidence task
   rather than restoring local repo-B behavior.

---

## 11. Change Log

- 2026-04-16 — Codex created the initial `FBP-014A` BFF/frontend handoff packet from the shared
  machine truth, the parent E2E matrix/evidence pack, and the previously frozen `FBP-006` +
  `FBP-014` guardrails.

---

This packet is a sidecar support artifact. It records the `FBP-014A` scaffold handoff boundary; it
does not replace the parent matrix or evidence pack, rewrite task scope, or modify machine-tracked
canonical task evidence.
