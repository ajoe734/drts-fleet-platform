# Phase 1 Operational Remediation Execution Packet — 2026-04-30

Status: ready for supervisor-managed execution planning  
Owner: Supervisor  
Scope: `drts-fleet-platform` plus `tenant-commute-hub`

## 1. Purpose

This packet materializes the comprehensive remediation plan at:

- `docs/02-architecture/phase1-operational-complete-remediation-plan-20260430.md`

It is the next-step execution packet after:

- `docs/03-runbooks/phase1-operational-blueprint-execution-packet-20260429.md`

The intent is to turn the newly completed role / scenario / negative-flow
planning into supervisor-ready follow-on tasks with:

- concrete task IDs
- dependency ordering
- write scopes
- operator-facing acceptance
- negative-path verification anchors

This packet is not a replacement for `OPX-*`; it is the detailed remediation
packet that should be opened only where the broader `OPX-*` families need a
more granular implementation wave.

## 2. Guardrails

- Keep `drts-fleet-platform` as the only business authority.
- Keep `tenant-commute-hub` as a frontend consumer only.
- Do not reopen intentionally deferred first-party passenger, call-point,
  concierge, or AV families.
- Do not model negative flows only in prose; each task must name the UI/API/runbook
  surfaces that carry the failure path.
- Every override path must name actor, reviewer, reason, audit trace, and expiry.
- Every sensitive artifact or credential path must name masking, retention,
  and access-control rules.

## 3. Dispatch Families

- `ORX-ID-*` — identity, auth, and actor lifecycle
- `ORX-MD-*` — master data, onboarding, and lifecycle operations
- `ORX-IN-*` — intake, phone, partner, issuer, and forwarder negative paths
- `ORX-DP-*` — queue, dispatch, redispatch, override, and spatial operations
- `ORX-DRV-*` — driver proof, offline, and session recovery
- `ORX-CS-*` — complaint, incident, escalation, and service recovery
- `ORX-FN-*` — finance, reconciliation, artifact, and retention controls
- `ORX-GV-*` — runbook, acceptance, release gate, and terminology sync

## 4. Execution Summary Table

| Task ID       | Family           | Objective                                                                 | Repo                                                                                           | Depends On                                                                          |
| ------------- | ---------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `ORX-ID-001`  | Identity         | Driver registration, token refresh, revoke, and rebind flow               | `drts-fleet-platform`                                                                          | `OPX-ID-001`, `OPX-MD-001`                                                          |
| `ORX-ID-002`  | Identity         | Tenant / partner / driver auth negative-path regression pack              | `drts-fleet-platform`, `tenant-commute-hub`                                                    | `OPX-ID-002`, `OPX-IN-001`                                                          |
| `ORX-MD-001`  | Master Data      | Driver master admin console and lifecycle enforcement                     | `drts-fleet-platform`                                                                          | `OPX-MD-001`                                                                        |
| `ORX-MD-002`  | Master Data      | Vehicle, insurance, exclusivity, and offboarding lifecycle UX             | `drts-fleet-platform`                                                                          | `OPX-MD-002`                                                                        |
| `ORX-MD-003`  | Master Data      | Tenant rollout console, role invitation, and rollback controls            | `drts-fleet-platform`, `tenant-commute-hub`                                                    | `OPX-MD-003`                                                                        |
| `ORX-MD-004`  | Master Data      | Partner / bank / entry lifecycle console and revoke flow                  | `drts-fleet-platform`, `tenant-commute-hub`                                                    | `OPX-IN-001`                                                                        |
| `ORX-IN-001`  | Intake           | Call-center booking workspace with recording-state handling               | `drts-fleet-platform`                                                                          | `OPX-IN-005`, `OPX-CM-001`                                                          |
| `ORX-IN-002`  | Intake           | Partner eligibility failure handling and manual review lane               | `drts-fleet-platform`, `tenant-commute-hub`                                                    | `OPX-IN-002`, `OPX-CM-001`                                                          |
| `ORX-IN-003`  | Intake           | Forwarder sync-failed, lost-race, and reconciliation workflow             | `drts-fleet-platform`, `apps/driver-app`                                                       | `OPX-IN-004`, `OPX-CM-004`                                                          |
| `ORX-DP-001`  | Dispatch         | Queue-family implementation and queue-entry policy surfacing              | `drts-fleet-platform`, `apps/ops-console-web`                                                  | `OPX-DP-001`                                                                        |
| `ORX-DP-002`  | Dispatch         | Reassign / redispatch / timeout / no-supply operator workflow             | `drts-fleet-platform`, `apps/ops-console-web`                                                  | `OPX-DP-002`, `ORX-DP-001`                                                          |
| `ORX-DP-003`  | Dispatch         | Exception-hold, override approval, and release workflow                   | `drts-fleet-platform`, `apps/ops-console-web`                                                  | `OPX-DP-003`, `ORX-IN-002`                                                          |
| `ORX-DP-004`  | Dispatch         | Map-board MVP with stale-location and no-location states                  | `apps/ops-console-web`, `tenant-commute-hub`                                                   | `OPX-DP-004`, `OPX-DP-005`                                                          |
| `ORX-DRV-001` | Driver           | Completion proof bundle UX and contract-driven proof validation           | `drts-fleet-platform`, `apps/driver-app`                                                       | `OPX-CM-001`                                                                        |
| `ORX-DRV-002` | Driver           | Offline event replay, duplicate-complete prevention, and session recovery | `drts-fleet-platform`, `apps/driver-app`                                                       | `ORX-ID-001`, `ORX-DRV-001`                                                         |
| `ORX-CS-001`  | Customer Service | Complaint taxonomy, reopen, SLA breach, and cross-lane linking            | `drts-fleet-platform`, `apps/ops-console-web`                                                  | `OPX-CM-002`                                                                        |
| `ORX-CS-002`  | Customer Service | Incident escalation, service recovery, and dispatch-exception handoff     | `drts-fleet-platform`, `apps/ops-console-web`, `apps/driver-app`                               | `ORX-CS-001`, `ORX-DP-003`                                                          |
| `ORX-FN-001`  | Finance          | Channel-aware payer / sponsor / payout matrix implementation              | `drts-fleet-platform`, `tenant-commute-hub`, `apps/platform-admin-web`, `apps/ops-console-web` | `OPX-CM-004`, `OPX-CM-003`                                                          |
| `ORX-FN-002`  | Finance          | Reconciliation issue queue, ownership, and dispute resolution workflow    | `drts-fleet-platform`, `apps/platform-admin-web`, `apps/ops-console-web`                       | `ORX-FN-001`, `ORX-IN-003`                                                          |
| `ORX-FN-003`  | Finance          | Artifact download policy, masking, retention, and legal-hold operations   | `drts-fleet-platform`, `apps/platform-admin-web`, `tenant-commute-hub`                         | `OPX-CM-005`, `OPX-ID-003`                                                          |
| `ORX-GV-001`  | Governance       | Negative-path UAT pack and release gate expansion                         | `drts-fleet-platform`, `tenant-commute-hub`                                                    | `ORX-ID-002`, `ORX-IN-001`, `ORX-DP-002`, `ORX-DRV-001`, `ORX-CS-001`, `ORX-FN-001` |
| `ORX-GV-002`  | Governance       | Role ownership matrix, runbooks, and escalation routing set               | `drts-fleet-platform`, `tenant-commute-hub`                                                    | `ORX-MD-003`, `ORX-IN-001`, `ORX-DP-003`, `ORX-CS-002`, `ORX-FN-002`                |
| `ORX-GV-003`  | Governance       | Glossary, error-copy, and multilingual failure-state consistency          | `drts-fleet-platform`, `tenant-commute-hub`, `apps/*`                                          | `ORX-GV-001`, `ORX-GV-002`                                                          |

## 5. Detailed Task Definitions

## `ORX-ID-001` — Driver Registration, Refresh, Revoke, And Rebind Flow

### Objective

Finish the driver device lifecycle beyond initial provisioning: registration,
token refresh, revoke, rebind, and suspension-aware session invalidation.

### Write Scope

- `apps/driver-app/app/onboarding.tsx`
- `apps/driver-app/lib/api-client.ts`
- `apps/api/src/modules/auth/`
- `apps/api/src/modules/driver-profile/`
- `apps/platform-admin-web/app/`
- `docs/03-runbooks/driver-app-native-dev-runbook.md`

### Acceptance

- Unprovisioned devices can request registration but cannot access driver APIs.
- Suspended or revoked drivers lose refresh ability immediately.
- Admin can revoke or rebind a device with audit trace.
- Dev-only env override remains explicit and isolated.

### Verification

- mobile auth smoke
- revoke / rebind unit tests
- admin lifecycle walkthrough

## `ORX-ID-002` — Auth Negative-Path Regression Pack

### Objective

Turn tenant / partner / driver auth failure cases into explicit automated and
UAT-visible regression paths.

### Write Scope

- `apps/api/src/modules/auth/`
- `apps/api/src/modules/tenant-partner/`
- `apps/api/src/modules/driver-profile/`
- `tenant-commute-hub/src/contexts/AuthContext.tsx`
- `docs/04-uat/`

### Acceptance

- Wrong tenant scope is rejected deterministically.
- Inactive partner entry and wrong partner scope reject before formal booking.
- Driver auth rejects suspended / revoked / invalid-cert states cleanly.
- Failure outcomes are mapped to user-facing and audit-facing semantics.

### Verification

- negative auth tests
- UAT matrix additions

## `ORX-MD-001` — Driver Master Admin Console And Lifecycle

### Objective

Materialize the platform-side driver master lifecycle, including activation,
suspension, retirement, and device associations.

### Write Scope

- `apps/platform-admin-web/app/`
- `apps/api/src/modules/driver-profile/`
- `apps/api/src/modules/regulatory-registry/`
- `packages/contracts/src/index.ts`

### Acceptance

- Admin can create, activate, suspend, and retire a driver master.
- Driver state affects dispatch eligibility and session validity.
- Device associations are visible from the driver master view.

### Verification

- driver master tests
- platform-admin typecheck

## `ORX-MD-002` — Supply Lifecycle UX

### Objective

Expose the supply lifecycle for vehicle, insurance, exclusivity, and offboarding
to both platform admins and operators.

### Write Scope

- `apps/platform-admin-web/app/fleet/`
- `apps/ops-console-web/app/vehicles/`
- `apps/api/src/modules/regulatory-registry/`
- `packages/contracts/src/index.ts`

### Acceptance

- Expired insurance and rejected exclusivity are operator-visible.
- Offboarding creates and tracks debranding work.
- Dispatchability warnings are visible before dispatch attempts fail.

### Verification

- lifecycle tests
- platform-admin / ops-console typecheck

## `ORX-MD-003` — Tenant Rollout Console And Rollback Controls

### Objective

Turn tenant onboarding into an explicit lifecycle with invitation, rollout gate,
pilot readiness, and rollback controls.

### Write Scope

- `apps/platform-admin-web/app/tenants/`
- `tenant-commute-hub/src/pages/AdminPanel.tsx`
- `apps/api/src/modules/platform-admin/`
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`

### Acceptance

- Tenant lifecycle states are explicit and operator-visible.
- Missing role acknowledgment or missing rollout evidence blocks promotion.
- Rollback hold and suspension states are supported explicitly.

### Verification

- tenant onboarding tests
- runbook review

## `ORX-MD-004` — Partner / Bank Lifecycle Console

### Objective

Productize partner, program, entry, and credential lifecycle management with
revoke and inactive handling.

### Write Scope

- `apps/platform-admin-web/app/partners/`
- `apps/api/src/modules/tenant-partner/`
- `tenant-commute-hub/src/pages/Login.tsx`
- `packages/contracts/src/index.ts`

### Acceptance

- Admin can create, activate, inactivate, and revoke partner entries.
- Portal and API honor inactive / revoked entries consistently.
- Credential rotation and revoke paths are auditable.

### Verification

- partner lifecycle tests
- platform-admin typecheck

## `ORX-IN-001` — Call-Center Booking Workspace

### Objective

Close the operator-side phone-order gap with a booking workspace that handles
call session, ETA, recording state, and complaint handoff in one flow.

### Write Scope

- `apps/ops-console-web/app/callcenter/`
- `apps/ops-console-web/app/dispatch/`
- `apps/api/src/modules/callcenter/`
- `apps/api/src/modules/owned-mobility/`

### Acceptance

- Call-center agents can complete a phone booking without leaving the workspace.
- Recording state is visible as `ready`, `pending`, or `missing`.
- Complaint handoff and callback actions are part of the same workflow.

### Verification

- call-center UAT
- focused operator smoke

## `ORX-IN-002` — Partner Eligibility Failure And Manual Review Lane

### Objective

Define and implement what happens when issuer eligibility fails, times out, or
requires human review.

### Write Scope

- `apps/api/src/modules/tenant-partner/`
- `tenant-commute-hub/src/pages/NewBooking.tsx`
- `apps/ops-console-web/app/contracts/`
- `docs/03-runbooks/`

### Acceptance

- Eligibility timeouts, denials, and manual review states are explicit.
- Operators can see review-needed cases without silently creating invalid orders.
- Portal error copy and backend audit stay consistent.

### Verification

- eligibility negative tests
- review workflow walkthrough

## `ORX-IN-003` — Forwarder Failure And Reconciliation Workflow

### Objective

Operationalize `lost_race`, `cancelled_by_platform`, and `sync_failed` states
into visible ops and finance workflows.

### Write Scope

- `apps/api/src/modules/forwarder/`
- `apps/api/src/modules/owned-mobility/`
- `apps/driver-app/app/jobs.tsx`
- `apps/ops-console-web/app/dispatch/`
- `apps/ops-console-web/app/revenue/`

### Acceptance

- Sync-failed mirrors produce reviewable reconciliation issues.
- Lost-race and cancelled-by-platform states close driver tasks correctly.
- Finance can tell operational mirror failure from commercial settlement truth.

### Verification

- forwarder workflow tests
- ops + finance walkthrough

## `ORX-DP-001` — Queue Families And Queue-Entry Surfacing

### Objective

Materialize explicit queue families and make queue-entry reason visible to
operators.

### Write Scope

- `apps/api/src/modules/owned-mobility/`
- `apps/ops-console-web/app/dispatch/`
- `packages/contracts/src/index.ts`

### Acceptance

- Queue families are explicit in API and UI.
- Operators can tell whether an order is in realtime, reservation, redispatch,
  recording-gated, or exception-hold queue.
- Queue entry reason is not inferred only from raw status strings.

### Verification

- queue-state tests
- dispatch UI smoke

## `ORX-DP-002` — Reassign / Redispatch / No-Supply Workflow

### Objective

Close the operator workflow for reject, timeout, no-supply, delayed queue, and
redispatch handling.

### Write Scope

- `apps/api/src/modules/owned-mobility/`
- `apps/ops-console-web/app/dispatch/`
- `docs/03-runbooks/`

### Acceptance

- Reassign vs redispatch semantics are distinct and operator-visible.
- No-supply and delayed cases have escalation paths.
- Timeout and rejection reason codes are preserved end to end.

### Verification

- redispatch tests
- operator negative-path UAT

## `ORX-DP-003` — Exception-Hold And Override Release Workflow

### Objective

Turn exception-hold and override handling into a formal reviewed workflow.

### Write Scope

- `apps/api/src/modules/owned-mobility/`
- `apps/api/src/modules/callcenter/`
- `apps/ops-console-web/app/dispatch/`
- `apps/ops-console-web/app/incidents/`

### Acceptance

- Override request, approval, release, and expiry are explicit.
- Silent release is impossible.
- Each override path is traceable by actor and reason.

### Verification

- override workflow tests
- audit review

## `ORX-DP-004` — Map-Board MVP

### Objective

Deliver the minimum viable map board for dispatch and call-center assistance
without creating a second authority path.

### Write Scope

- `apps/ops-console-web/app/dispatch/`
- `tenant-commute-hub/src/components/MapPicker.tsx`
- `packages/contracts/src/index.ts`

### Acceptance

- Operators can view pickup, dropoff, candidate supply, and stale-location states.
- No-location and stale-location conditions are explicit.
- Map interaction does not mutate booking or dispatch truth outside core API actions.

### Verification

- operator map smoke
- location-state walkthrough

## `ORX-DRV-001` — Proof Bundle UX

### Objective

Close the gap between contract-driven proof rules and actual driver proof capture UX.

### Write Scope

- `apps/driver-app/app/trip.tsx`
- `apps/api/src/modules/owned-mobility/`
- `packages/contracts/src/index.ts`

### Acceptance

- Driver sees required proof types before completion attempt.
- Missing signoff, photo, or expense proof is handled with actionable UX.
- Proof-required states remain visible to ops and finance.

### Verification

- driver proof smoke
- contract-driven proof tests

## `ORX-DRV-002` — Offline Replay And Session Recovery

### Objective

Support completion safety under weak network, stale session, and duplicate-submit conditions.

### Write Scope

- `apps/driver-app/app/trip.tsx`
- `apps/driver-app/lib/api-client.ts`
- `apps/api/src/modules/owned-mobility/`
- `docs/03-runbooks/`

### Acceptance

- Duplicate completion is prevented idempotently.
- Pending proof or trip events can replay safely.
- Expired session during replay is recoverable with explicit re-auth flow.

### Verification

- offline / replay tests
- mobile negative-path smoke

## `ORX-CS-001` — Complaint Workflow Closure

### Objective

Normalize complaint categories, reopen, SLA breach, and evidence linkage.

### Write Scope

- `apps/api/src/modules/complaint/`
- `apps/ops-console-web/app/complaints/`
- `docs/04-uat/`

### Acceptance

- Complaint categories map to SLA and closure reasons.
- Reopen preserves case identity and history.
- SLA breach becomes a flag and alert, not a state overwrite.

### Verification

- complaint tests
- UAT scenarios

## `ORX-CS-002` — Incident Escalation And Service Recovery

### Objective

Finish the cross-lane behavior between dispatch exceptions, incident handling,
and service recovery.

### Write Scope

- `apps/api/src/modules/incident/`
- `apps/ops-console-web/app/incidents/`
- `apps/driver-app/app/incident.tsx`
- `docs/03-runbooks/`

### Acceptance

- Incident owner, severity, and escalation target are explicit.
- Dispatch exceptions can become incidents without losing original trace.
- Service-recovery actions are visible and reviewable.

### Verification

- incident tests
- cross-lane workflow walkthrough

## `ORX-FN-001` — Channel-Aware Payer / Sponsor / Payout Matrix

### Objective

Make settlement semantics explicit across tenant, partner, phone, and forwarder channels.

### Write Scope

- `apps/api/src/modules/billing-settlement/`
- `apps/api/src/modules/reporting-filing/`
- `apps/platform-admin-web/app/payments/`
- `apps/ops-console-web/app/revenue/`
- `tenant-commute-hub/src/pages/BillingManagement.tsx`

### Acceptance

- Every channel answers payer, sponsor, invoice owner, receipt owner, and driver payout authority.
- Discount and reimbursement behavior is consistent with sponsor truth.
- Reporting and settlement use the same channel semantics.

### Verification

- settlement tests
- finance review walkthrough

## `ORX-FN-002` — Reconciliation Issue Queue

### Objective

Add a first-class workflow for mismatch detection, assignment, and resolution.

### Write Scope

- `apps/api/src/modules/billing-settlement/`
- `apps/platform-admin-web/app/payments/`
- `apps/ops-console-web/app/revenue/`
- `docs/03-runbooks/`

### Acceptance

- Finance can open, assign, reopen, and resolve reconciliation issues.
- Forwarder mismatch and partner-sponsor mismatch are supported explicitly.
- Resolution artifacts and comments are retained.

### Verification

- reconciliation tests
- finance ops walkthrough
- workflow runbook: `docs/03-runbooks/reconciliation-issue-workflow-runbook.md`

## `ORX-FN-003` — Artifact, Masking, Retention, And Legal-Hold Operations

### Objective

Operationalize sensitive artifact access, masking, retention, and hold behavior.

### Write Scope

- `apps/api/src/modules/reporting-filing/`
- `apps/api/src/modules/audit-notification/`
- `apps/platform-admin-web/app/audit/`
- `tenant-commute-hub/src/pages/AuditLog.tsx`
- `docs/03-runbooks/`

### Acceptance

- Artifact families have explicit access and masking rules.
- Download, hold, and deletion-exception operations are auditable.
- Time-limited access and legal-hold rules do not conflict.

### Verification

- artifact access tests
- retention policy review

## `ORX-GV-001` — Negative-Path UAT Pack

### Objective

Expand acceptance beyond happy-path coverage into a formal negative-path release gate.

### Write Scope

- `docs/04-uat/`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
- `docs/03-runbooks/`

### Acceptance

- Each critical scenario family has at least one positive, one negative, and one permission/audit test.
- Release gates name negative-path evidence explicitly.
- Operational sign-off no longer assumes backend-only guards are sufficient.

### Verification

- updated UAT pack
- gate review

## `ORX-GV-002` — Ownership Matrix And Runbook Set

### Objective

Make operator ownership explicit for exception, override, rollback, and escalation paths.

### Write Scope

- `docs/03-runbooks/`
- `docs/02-architecture/`
- `current-work.md`

### Acceptance

- Each major negative flow names an owner role and escalation target.
- Rollback, override, and manual review runbooks exist for high-risk workflows.
- Role handoff points are documented in one operator-facing set.

### Verification

- runbook audit
- role matrix review

## `ORX-GV-003` — Glossary And Failure-State Copy Consistency

### Objective

Align terminology and user-facing error copy across admin, ops, driver, tenant,
and partner surfaces.

### Write Scope

- `apps/platform-admin-web`
- `apps/ops-console-web`
- `apps/driver-app`
- `tenant-commute-hub/src`
- `docs/02-architecture/`

### Acceptance

- Shared operational terms have one glossary.
- Failure-state copy no longer contradicts backend semantics.
- Multilingual hotspots are cataloged and normalized.

### Verification

- copy audit
- glossary review

## 6. Recommended Dispatch Order

1. `ORX-ID-001`, `ORX-MD-001`, `ORX-MD-002`, `ORX-DP-001`, `ORX-FN-003`
2. `ORX-ID-002`, `ORX-MD-003`, `ORX-MD-004`, `ORX-IN-001`, `ORX-DRV-001`
3. `ORX-IN-002`, `ORX-IN-003`, `ORX-DP-002`, `ORX-CS-001`, `ORX-FN-001`
4. `ORX-DP-003`, `ORX-DP-004`, `ORX-DRV-002`, `ORX-CS-002`, `ORX-FN-002`
5. `ORX-GV-001`, `ORX-GV-002`, `ORX-GV-003`

## 7. Relationship To Existing Waves

- `EMC-*` remains post-closeout hardening.
- `P1PX-*` remains the productization wave.
- `OPX-*` remains the broad operational blueprint wave.
- `ORX-*` is the detailed remediation packet derived from the complete
  role/scenario/negative-flow planning and should be treated as the next
  granularity level when `OPX-*` needs concrete follow-on slices.

If these tasks are later materialized into `ai-status.json`, they should be
opened as a new execution family with explicit linkage back to the accepted
remediation plan and not mixed ambiguously into historical backlog.
