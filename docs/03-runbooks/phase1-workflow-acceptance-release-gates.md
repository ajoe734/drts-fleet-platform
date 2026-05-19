# Phase 1 Workflow Acceptance Matrix and Release Gates

## Purpose

This runbook is the baseline release-language companion for `OPX-GV-002`.

It answers one question:

> Which workflow families are actually verified, by which named paths, and
> which ones are still blocked on external systems or human sign-off?

This file is intentionally stricter than "typecheck passed" or "smoke is green".
Every closeout statement should name workflow families and their current gate
read instead of collapsing the story into repo-local tests.

## Scope

This baseline covers the current Phase 1 workflow families across:

- `docs/04-uat/`
- `tests/smoke/`
- `tests/e2e/`
- rollout and closeout runbooks

It does **not** replace:

- `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md`
- `support/sidecars/FBP-013B/FBP-013B-SMOKE-EVIDENCE-PACK.md`
- `support/sidecars/FBP-013C/FBP-013C-UAT-EVIDENCE-PACK.md`
- `support/sidecars/FBP-013D/FBP-013D-FINAL-EVIDENCE-CLOSEOUT.md`
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`

Those files remain the evidence anchors. This runbook is the matrix that tells
reviewers how to read them as release gates.

## Status Vocabulary

Use the following terms consistently:

| Status                         | Meaning                                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `PASS (repo-local)`            | The repo has named automated/manual verification for this family, but no separate live or external proof is implied.                |
| `PASS (static evidence)`       | Shared evidence is complete and reviewable, but the verdict still depends on static artifacts rather than a fresh live rerun.       |
| `PASS (live staging evidence)` | The family has named live staging proof in addition to repo-local coverage.                                                         |
| `HOLD`                         | The repo may be materially ready, but a required live sign-off, pilot observation, or environment activation is still missing.      |
| `EXTERNAL-GATED`               | The family depends on partner credentials, external adapters, store/distribution access, or other inputs outside repo-only closure. |

Rules:

- `PASS (repo-local)` is not enough to claim pilot or production readiness.
- `PASS (static evidence)` must keep its evidence anchor explicit.
- `EXTERNAL-GATED` work may be implemented or scaffolded in-repo, but it is not
  allowed to be restated as repo-only closure.
- Pilot and production remain separate gates even when staging evidence is green.

## Workflow Gate Matrix

| Family ID    | Workflow family                                                            | What must be true                                                                                                                                                | Named verification path                                                                                                                                                                                                                                                                   | Current gate read              | Remaining gate or non-claim                                                                                                                                                                                         |
| ------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WF-RLS-001` | Runtime, deploy, and release foundation                                    | CI, deploy ordering, migration, health, smoke, and UAT anchors are all named before any release claim.                                                           | `docs/03-runbooks/phase1-rollout.md`; `tests/smoke/01-health.sh`; `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md`; `support/sidecars/FBP-013D/FBP-013D-FINAL-EVIDENCE-CLOSEOUT.md`                                                                                   | `PASS (live staging evidence)` | Staging deploy evidence is live and reviewable, but named pilot sign-off, production dry runs, rollback-owner acknowledgement, and rollout-matrix execution are still required.                                     |
| `WF-TEN-001` | Tenant bootstrap, tenant boundary, and cross-tenant isolation              | Platform admin can create tenants, tenant bootstrap enforces correct scope, and a tenant cannot read another tenant's bookings.                                  | `docs/04-uat/phase1-uat-checklist.md` (`PA-001`, `TP-029` to `TP-032`, `E2E-004`); `tests/e2e/E2E-004-tenant-attribution.sh`; `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` §1, §4.2                                                                                         | `PASS (live staging evidence)` | This is not a claim that every future tenant rollout has human sign-off; it is a proof that the current authority and isolation paths are named and verified.                                                       |
| `WF-ORD-001` | Tenant booking intake and owned-order creation                             | Tenant booking flows create the right service bucket/subtype, survive read-back, and surface into dispatch.                                                      | `tests/smoke/02-booking-create.sh`; `docs/04-uat/phase1-uat-checklist.md` (`TP-001` to `TP-006`); `tests/e2e/E2E-001-enterprise-dispatch.sh`; `tests/e2e/E2E-004-tenant-attribution.sh`; `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` §4.1                                  | `PASS (live staging evidence)` | Production booking scale, tenant-by-tenant rollout timing, and external partner-channel credentials remain separate gates.                                                                                          |
| `WF-PRT-001` | Partner eligibility and airport-transfer benefit intake                    | Partner-scoped ingress, eligibility verification, manual-review/ineligible holds, and downstream booking/reporting truth stay explicit for `credit_card_airport_transfer` flows.                         | `docs/04-uat/phase1-uat-checklist.md` (`TP-003`, `TP-030` to `TP-032`); `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`; `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` §1, §2.3; `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`                       | `PASS (static evidence)`       | Repo/productization evidence is named, but real issuer sandbox/live proof remains external-gated under `EXT-001`; do not restate `WF-PRT-001` as live issuer closure until `PARTNER-ELIG-LIVE-001` (or equivalent) lands. |
| `WF-DSP-001` | Core dispatch queue, assign, reassign, and no-eligible-supply semantics    | Dispatch jobs appear in the queue, can be assigned/reassigned correctly, and do not fabricate success when supply is ineligible.                                 | `tests/smoke/03-dispatch-assign.sh`; `docs/04-uat/phase1-uat-checklist.md` (`OC-001` to `OC-006`); `tests/e2e/E2E-001-enterprise-dispatch.sh`                                                                                                                                             | `PASS (live staging evidence)` | The core owned happy path is live-proven; advanced exception-hold and manual-override governance are tracked separately in `OPX-DP-003`, so this baseline gate does not claim that later slice is already approved. |
| `WF-DRV-001` | Driver identity, owned-task lifecycle, and platform presence               | Driver can see owned work, accept/depart/arrive/start/complete it, and the app names auth/platform-presence gates instead of treating them as implicit behavior. | `tests/smoke/04-driver-task-accept.sh`; `docs/04-uat/phase1-uat-checklist.md` (`DA-001` to `DA-017`, `DA-019`, `DA-021`, `DA-022`, `DA-024`, `DA-025`); `tests/e2e/E2E-001-enterprise-dispatch.sh`                                                                                        | `PASS (static evidence)`       | The owned happy path is live-proven, but device-registration denial, re-auth denial, and some proof-gate paths still rely on UAT/static evidence rather than a separate live closeout packet.                       |
| `WF-DRV-MP-001` | Driver multi-platform task mirror, platform health, earnings authority split, and SOS source-platform context | The driver app surfaces unified task/platform context across owned and forwarded work, preserves source-platform authority metadata, keeps earnings authority split explicit, and names platform-health / distribution gates instead of collapsing them into an owned-only or repo-only claim. | `docs/03-runbooks/driver-app-multi-platform-execution-packet-20260507.md`; `support/sidecars/API-MP-001/API-MP-001-SIDECAR-ACCEPTANCE.md`; `support/sidecars/DRV-MAT-007/DRV-MAT-007-SIDECAR-ACCEPTANCE.md`; `support/sidecars/DRV-UI-RD-006/DRV-UI-RD-006-SIDECAR-ACCEPTANCE.md`; `support/sidecars/DRV-MP-009/DRV-MP-009-SIDECAR-ACCEPTANCE.md`; `docs/05-ui/phase1-business-flow-integration-rebuttal-20260516-closeout.md` §1 | `PASS (static evidence)`       | Repo implementation and support evidence are complete, but installable physical-device / tester proof still stays in the mobile distribution gate (`EXT-003`), and forwarded live-adapter proof remains separately `EXTERNAL-GATED` under `WF-FWD-001`. |
| `WF-FWD-001` | Forwarded-order mirror and external-platform boundary                      | Forwarded work stays route-locked, shows source-platform metadata, and does not create an owned dispatch assignment.                                             | `docs/04-uat/phase1-uat-checklist.md` (`DA-005`, `E2E-002`); `docs/04-uat/fbp-014a-e2e-matrix.md` §4.2; `tests/e2e/E2E-002-forwarded-order.sh`                                                                                                                                            | `EXTERNAL-GATED`               | Repo guardrails are present, but live forwarded-task seeds, callback behavior, and platform-adapter confirmation are outside repo-only closure.                                                                     |
| `WF-COM-001` | Phone-order linkage, recording/proof gates, and compliance export boundary | Phone orders keep `call_id`, proof/recording gates are named, and filing/export is not over-claimed without live hooks.                                          | `docs/04-uat/phase1-uat-checklist.md` (`OC-021` to `OC-024`, `DA-007` to `DA-009`, `E2E-003`); `docs/04-uat/fbp-014a-e2e-matrix.md` §4.3; `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`                                                                                 | `HOLD`                         | CTI callback behavior, recording export, and month-end filing activation remain explicit deferred/live gates under `EXT-004-BLK-*`.                                                                                 |
| `WF-FIN-001` | Billing, invoice, report export, and sensitive artifact access             | Tenant invoice generation, report job creation, and permissioned downloads are all named verification paths.                                                     | `tests/smoke/05-billing-invoice.sh`; `tests/smoke/06-report-export.sh`; `docs/04-uat/phase1-uat-checklist.md` (`TP-013`, `TP-014`, `TP-021` to `TP-023`, `OC-017`, `OC-025`); `tests/e2e/E2E-001-enterprise-dispatch.sh`; `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` §4.1 | `PASS (static evidence)`       | Live invoice generation is proven, but report-job/export coverage is currently smoke/static rather than a dedicated live release pack, and month-end filing stays under `WF-COM-001`.                               |

## External-Gated Families Not Counted As Repo-Only Closure

These items must stay explicit in every release statement:

| Family                                       | Why it is not repo-only closure                                                                                                             | Current anchor                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Real bank / issuer eligibility               | `WF-PRT-001` names the repo/static gate, but live issuer proof still needs real contract, sandbox credentials, and allowed test cards.     | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`; `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a; future live closeout owner: `PARTNER-ELIG-LIVE-001` |
| Grab Taiwan or equivalent live adapter proof | Needs partner API contract, credentials, webhook signature, callback, status sync, lost-race, and no-owned-assignment proof.                | `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`; `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`                                                 |
| Mobile distribution                          | Needs Expo account, Apple team, Android keystore, and tester groups.                                                                        | `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a; `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`                                      |
| Live CTI recording / filing activation       | Needs CTI or equivalent webhook environment, callback security, recording export, filing-package activation, and retention/access sign-off. | `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`; `docs/04-uat/phase1-uat-checklist.md` deferred tracker; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.3 |

## Closeout Wording Rules

Good closeout language:

- "WF-ORD-001 and WF-DSP-001 are `PASS (live staging evidence)` via `E2E-001`; WF-FWD-001 remains `EXTERNAL-GATED`."
- "`WF-PRT-001` is `PASS (static evidence)` for partner-scoped eligibility and manual-review handling, while live issuer proof stays external-gated."
- "Billing invoice generation is live-proven under `WF-FIN-001`, while month-end filing remains `HOLD` under `WF-COM-001`."
- "`WF-DRV-MP-001` is `PASS (static evidence)` for the multi-platform driver mirror, while `WF-FWD-001` forwarded live-adapter proof remains `EXTERNAL-GATED` and installable device/tester proof still sits in the mobile distribution gate `EXT-003`."
- "`WF-RLS-001` is `PASS (live staging evidence)`, but pilot and production remain `HOLD` until named sign-off exists."

Bad closeout language:

- "All tests passed."
- "UAT is green, therefore release is done."
- "Forwarded orders are complete" when the live adapter path was skipped or depends on external data.
- "Phase 1 is production-ready" without naming pilot and production gate status.

## Negative-Path Release Gate Expansion (ORX-GV-001)

Added: 2026-04-30 | Owner: Claude2 | Reviewer: Claude

### Purpose

This section expands the baseline positive-path gate matrix into explicit
negative-path, permission, and audit evidence requirements. Each workflow family
must name its negative-path verification before a release gate can be read as
operationally complete. Operational sign-off no longer assumes backend-only
guards are sufficient — UX-level guards, permission denials, and audit traces
must be separately verified.

### Negative-Path Evidence Requirements Per Family

| Family ID    | Positive evidence (baseline)                                                 | Negative-path evidence (ORX-GV-001)                                                                                                                                                                                                                                | Permission/audit evidence (ORX-GV-001)                                         | Negative-path gate read  |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------ |
| `WF-RLS-001` | CI, deploy, migration, health                                                | Rollback path named; migration down tested                                                                                                                                                                                                                         | Deploy audit trail present                                                     | `PASS (repo-local)`      |
| `WF-TEN-001` | Tenant create, bootstrap, cross-tenant isolation                             | Scope mismatch rejected (`TP-030`); suspended user blocked (`TP-031`); inactive partner blocked (`TP-032`); revoked key rejected (`NP-AUTH-001`); cross-tenant key isolation (`NP-AUTH-002`)                                                                       | Device rebind invalidation (`NP-AUTH-003`); bootstrap rejection audited        | `PASS (static evidence)` |
| `WF-ORD-001` | Booking create, read-back, dispatch surface                                  | Address unresolvable (`TP-002`); flight number missing (`TP-004`); modify after deadline (`TP-006`)                                                                                                                                                                | Booking creation audited; modification attempt audited                         | `PASS (static evidence)` |
| `WF-PRT-001` | Partner eligibility and airport-transfer benefit intake                      | Ineligible card/program denied (`tests/unit/tenant-partner-foundation.test.ts`); cross-partner verification rejected (`apps/api/tests/unit/tenant-partner.service.test.ts`); issuer timeout/retry exhaustion lands in manual review (`support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`; `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`) | Queue read and evidence access audited; fallback does not imply approval       | `PASS (static evidence)` |
| `WF-DSP-001` | Core dispatch queue, assign, reassign, and no-eligible-supply semantics      | Permission-denied assign (`NP-DSP-001`); ineligible driver reassign (`NP-DSP-002`); timeout escalation (`NP-DSP-003`); override without reason (`NP-OVR-001`); expired override revoked (`NP-OVR-003`)                                                             | Non-manager override blocked (`NP-OVR-002`); dispatch trace on failed reassign | `PASS (repo-local)`      |
| `WF-DRV-001` | Task lifecycle, platform presence, auth                                      | Trip before pickup (`DA-004`); fixed price immutable (`DA-006`); photo required (`DA-007`); signoff required (`DA-008`); expense proof required (`DA-009`); expired license blocked (`DA-022`); registration denied (`DA-024`); revoked session blocked (`DA-025`) | Driver self-scoped earnings (`DA-017`); auth denial audited                    | `PASS (static evidence)` |
| `WF-DRV-MP-001` | Multi-platform task mirror, health-center parity, and source-platform context | Driver/platform mismatch surfaced (`DRV-MP-008`; `apps/driver-app/tests/unit/driver-identity-bootstrap.test.ts`); re-auth/token-expired states remain visible (`DRV-MP-006`, `DRV-MP-009`; `apps/api/tests/unit/forwarder.service.test.ts`; `support/sidecars/DRV-MP-009/DRV-MP-009-SIDECAR-ACCEPTANCE.md`); unsupported forwarded actions stay route-locked (`DRV-MP-004`; `apps/driver-app/tests/unit/trip-workflow.test.ts`; `apps/driver-app/tests/unit/route-display.test.ts`); SOS keeps source-platform metadata (`DRV-MP-010`; `apps/driver-app/tests/unit/incident-screen.test.ts`). | Driver remains self-scoped to own bindings/earnings (`support/sidecars/DRV-MAT-007/DRV-MAT-007-SIDECAR-ACCEPTANCE.md`; `support/sidecars/DRV-UI-RD-006/DRV-UI-RD-006-SIDECAR-ACCEPTANCE.md`), and mobile distribution proof remains explicitly external-gated via `EXT-003`. | `PASS (static evidence)` |
| `WF-FWD-001` | Forwarded-order mirror and external-platform boundary                        | Accept after cancellation blocked (`NP-FWD-001`); route override blocked (`NP-FWD-002`); sync failure surfaced (`NP-FWD-003`)                                                                                                                                      | Route override attempt audited                                                 | `EXTERNAL-GATED`         |
| `WF-COM-001` | Phone booking linkage, recording/proof gates, and compliance export boundary | Missing recordings flagged in filing (`NP-COM-001`); non-compliance access denied (`NP-COM-002`)                                                                                                                                                                   | Recording download audited (`SC-040`)                                          | `HOLD`                   |
| `WF-FIN-001` | Invoice generation, report export, and sensitive artifact access             | Empty-period invoice (`NP-FIN-001`); unauthorized download blocked (`NP-FIN-002`); cross-driver earnings blocked (`NP-FIN-003`); non-finance dispute blocked (`NP-FIN-004`)                                                                                        | Download audit trail (`SC-040`); reconciliation access audited                 | `PASS (static evidence)` |

### Operational Sign-Off Expansion

The baseline sign-off matrix assumed backend guards were sufficient. With
ORX-GV-001, the following additional sign-off requirements are added:

1. **UX-level permission denial** — Each surface must show that a denied action
   produces a user-visible error, not a silent failure or blank screen. The
   `NP-DSP-001`, `NP-FIN-002`, `NP-COM-002`, and `NP-OVR-002` scenarios
   specifically verify UX-facing denial behavior.

2. **Audit trail completeness** — Every denied access attempt, override
   request, and session invalidation must produce an audit entry. The reviewer
   must confirm that audit is not limited to successful actions.

3. **Escalation visibility** — Timeouts, override expirations, and SLA
   breaches must produce operator-visible notifications, not just backend
   state changes. `NP-DSP-003`, `NP-OVR-003`, and `SC-CS-005` verify this.

### Coverage Summary

| Category                     | Baseline count | ORX-GV-001 additions | Total   |
| ---------------------------- | -------------- | -------------------- | ------- |
| Positive-path UAT scenarios  | 58             | 0                    | 58      |
| Negative-path UAT scenarios  | 22             | 20                   | 42      |
| Permission/audit scenarios   | 12             | 8                    | 20      |
| Complaint workflow (ORX-CS)  | 0              | 6                    | 6       |
| **Total scenario inventory** | **92**         | **34**               | **126** |

`WF-TGV-001` adds named repo-local governance negative coverage in this matrix,
but the historical scenario-inventory totals above remain unchanged until
`TST-E2E-005-TGV` lands the dedicated shell-E2E/UAT tracker entries.

### Relationship To The Remediation Wave

This `OPX-GV-002` runbook is the baseline workflow-family map.

`ORX-GV-001` has expanded the model into negative-path release gating. Reviewers
should now treat the negative-path evidence table above as the binding release
gate requirement in addition to the baseline positive-path matrix.

## Reference Anchors

- `docs/03-runbooks/phase1-rollout.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md`
- `docs/04-uat/phase1-uat-scenarios.md`
- `docs/04-uat/phase1-uat-checklist.md`
- `docs/04-uat/fbp-014a-e2e-matrix.md`
- `docs/05-ui/tenant-console-redesign-closeout-20260514.md`
- `docs/05-ui/phase1-business-flow-integration-rebuttal-20260516-closeout.md`
- `tests/smoke/README.md`
- `tests/e2e/README.md`
- `support/sidecars/BE-INTEG-001/BE-INTEG-001-SIDECAR-REVIEW.md`
- `support/sidecars/ADM-UI-GOV-001/ADM-UI-GOV-001-SIDECAR-ACCEPTANCE.md`
- `support/sidecars/FBP-013D/FBP-013D-FINAL-EVIDENCE-CLOSEOUT.md`
- `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md`
