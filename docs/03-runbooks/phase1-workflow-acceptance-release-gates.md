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
| `PASS (sandbox evidence)`      | The family has deterministic sandbox-backed proof for the intended workflow, but not live partner / provider production evidence.   |
| `PASS (static evidence)`       | Shared evidence is complete and reviewable, but the verdict still depends on static artifacts rather than a fresh live rerun.       |
| `PASS (live staging evidence)` | The family has named live staging proof in addition to repo-local coverage.                                                         |
| `HOLD`                         | The repo may be materially ready, but a required live sign-off, pilot observation, or environment activation is still missing.      |
| `EXTERNAL-GATED`               | The family depends on partner credentials, external adapters, store/distribution access, or other inputs outside repo-only closure. |

Rules:

- `PASS (repo-local)` is not enough to claim pilot or production readiness.
- `PASS (sandbox evidence)` is stronger than scaffold-only repo-local coverage, but it is still not live partner validation.
- `PASS (static evidence)` must keep its evidence anchor explicit.
- `EXTERNAL-GATED` work may be implemented or scaffolded in-repo, but it is not
  allowed to be restated as repo-only closure.
- Pilot and production remain separate gates even when staging evidence is green.

## Workflow Gate Matrix

| Family ID     | Workflow family                                                              | What must be true                                                                                                                                                                                                                                   | Named verification path                                                                                                                                                                                                                                                                   | Current gate read                  | Remaining gate or non-claim                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WF-RLS-001`  | Runtime, deploy, and release foundation                                      | CI, deploy ordering, migration, health, smoke, and UAT anchors are all named before any release claim.                                                                                                                                              | `docs/03-runbooks/phase1-rollout.md`; `tests/smoke/01-health.sh`; `support/sidecars/FBP-013A/FBP-013A-STAGING-DEPLOY-EVIDENCE-PACK.md`; `support/sidecars/FBP-013D/FBP-013D-FINAL-EVIDENCE-CLOSEOUT.md`                                                                                   | `PASS (live staging evidence)`     | Staging deploy evidence is live and reviewable, but named pilot sign-off, production dry runs, rollback-owner acknowledgement, and rollout-matrix execution are still required.                                                                                                                                                                                                                       |
| `WF-PROD-001` | Production deploy rail, rollback dispatch, and protected health verification | Production deploy must be manual, pinned to a `prod/v<date>` tag, validate WIF / Cloud SQL / Secret Manager wiring, run the migration + deploy graph in order, and support rollback by redeploying the prior prod tag with protected health checks. | `.github/workflows/deploy-prod.yml`; `tests/e2e/E2E-009-prod-rail-dry-run.sh`; `support/sidecars/PROD-RAIL-CLOSEOUT-20260519/PROD-RAIL-CLOSEOUT-EVIDENCE.md`; `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`; `docs/ops/branch-strategy.md` §7                               | `PASS (dry-run contract evidence)` | E2E-009 confirms the rail's non-skeleton structure (validate-config / build-push / migrate / deploy / health-check all wired). Actual live prod execution remains `EXTERNAL-GATED`: requires `vars.PROD_GCP_*` + `secrets.PROD_WIF_*` configured in repo Settings, GCP project provisioned (WIF / Cloud SQL / Artifact Registry / Secret Manager), and GitHub Environment `production` reviewer rule. |
| `WF-TEN-001`  | Tenant bootstrap, tenant boundary, and cross-tenant isolation                | Platform admin can create tenants, tenant bootstrap enforces correct scope, and a tenant cannot read another tenant's bookings.                                                                                                                     | `docs/04-uat/phase1-uat-checklist.md` (`PA-001`, `TP-029` to `TP-032`, `E2E-004`); `tests/e2e/E2E-004-tenant-attribution.sh`; `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` §1, §4.2                                                                                         | `PASS (live staging evidence)`     | This is not a claim that every future tenant rollout has human sign-off; it is a proof that the current authority and isolation paths are named and verified.                                                                                                                                                                                                                                         |
| `WF-ORD-001`  | Tenant booking intake and owned-order creation                               | Tenant booking flows create the right service bucket/subtype, survive read-back, and surface into dispatch.                                                                                                                                         | `tests/smoke/02-booking-create.sh`; `docs/04-uat/phase1-uat-checklist.md` (`TP-001` to `TP-006`); `tests/e2e/E2E-001-enterprise-dispatch.sh`; `tests/e2e/E2E-004-tenant-attribution.sh`; `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` §4.1                                  | `PASS (live staging evidence)`     | Production booking scale, tenant-by-tenant rollout timing, and external partner-channel credentials remain separate gates.                                                                                                                                                                                                                                                                            |
| `WF-PRT-001`  | Partner eligibility and airport-transfer benefit intake                      | Partner-scoped ingress, eligibility verification, manual-review/ineligible holds, and downstream booking/reporting truth stay explicit for `credit_card_airport_transfer` flows.                                                                    | `docs/04-uat/phase1-uat-checklist.md` (`TP-003`, `TP-030` to `TP-032`); `docs/03-runbooks/partner-eligibility-manual-review-runbook.md`; `docs/03-runbooks/tenant-governance-wave-closeout-20260514.md` §1, §2.3; `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`                     | `PASS (static evidence)`           | Repo/productization evidence is named, but real issuer sandbox/live proof remains external-gated under `EXT-001`; do not restate `WF-PRT-001` as live issuer closure until `PARTNER-ELIG-LIVE-001` (or equivalent) lands.                                                                                                                                                                             |
| `WF-DSP-001`  | Core dispatch queue, assign, reassign, and no-eligible-supply semantics      | Dispatch jobs appear in the queue, can be assigned/reassigned correctly, and do not fabricate success when supply is ineligible.                                                                                                                    | `tests/smoke/03-dispatch-assign.sh`; `docs/04-uat/phase1-uat-checklist.md` (`OC-001` to `OC-006`); `tests/e2e/E2E-001-enterprise-dispatch.sh`                                                                                                                                             | `PASS (live staging evidence)`     | The core owned happy path is live-proven; advanced exception-hold and manual-override governance are tracked separately in `OPX-DP-003`, so this baseline gate does not claim that later slice is already approved.                                                                                                                                                                                   |
| `WF-DRV-001`  | Driver identity, owned-task lifecycle, and platform presence                 | Driver can see owned work, accept/depart/arrive/start/complete it, and the app names auth/platform-presence gates instead of treating them as implicit behavior.                                                                                    | `tests/smoke/04-driver-task-accept.sh`; `docs/04-uat/phase1-uat-checklist.md` (`DA-001` to `DA-017`, `DA-019`, `DA-021`, `DA-022`, `DA-024`, `DA-025`); `tests/e2e/E2E-001-enterprise-dispatch.sh`                                                                                        | `PASS (static evidence)`           | The owned happy path is live-proven, but device-registration denial, re-auth denial, and some proof-gate paths still rely on UAT/static evidence rather than a separate live closeout packet.                                                                                                                                                                                                         |
| `WF-FWD-001`  | Forwarded-order mirror and external-platform boundary                        | Forwarded work stays route-locked, shows source-platform metadata, and does not create an owned dispatch assignment.                                                                                                                                | `docs/04-uat/phase1-uat-checklist.md` (`DA-005`, `E2E-002`); `docs/04-uat/fbp-014a-e2e-matrix.md` §4.2; `tests/e2e/E2E-002-forwarded-order.sh`                                                                                                                                            | `EXTERNAL-GATED`                   | Repo guardrails are present, but live forwarded-task seeds, callback behavior, and platform-adapter confirmation are outside repo-only closure.                                                                                                                                                                                                                                                       |
| `WF-COM-001`  | Phone-order linkage, recording/proof gates, and compliance export boundary   | Phone orders keep `call_id`, recording gates are enforced, repo-local export/filing evidence is reviewable, and live CTI/provider scope is not over-claimed.                                                                                        | `docs/04-uat/phase1-uat-checklist.md` (`OC-021` to `OC-024`, `DA-007` to `DA-009`, `E2E-003`); `tests/e2e/E2E-003-phone-recording-filing.sh`; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.3; `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`                                  | `PASS (sandbox evidence)`          | Repo-local phone-order -> callback -> export -> filing automation is proven, while live CTI/provider media, staging scheduler activation, and external retention execution remain explicit `EXT-004-BLK-*` gates.                                                                                                                                                                                     |
| `WF-FIN-001`  | Billing, invoice, report export, and sensitive artifact access               | Tenant invoice generation, report job creation, and permissioned downloads are all named verification paths.                                                                                                                                        | `tests/smoke/05-billing-invoice.sh`; `tests/smoke/06-report-export.sh`; `docs/04-uat/phase1-uat-checklist.md` (`TP-013`, `TP-014`, `TP-021` to `TP-023`, `OC-017`, `OC-025`); `tests/e2e/E2E-001-enterprise-dispatch.sh`; `support/sidecars/FBP-014B/FBP-014B-LIVE-EVIDENCE-PACK.md` §4.1 | `PASS (static evidence)`           | Live invoice generation is proven, but report-job/export coverage is currently smoke/static rather than a dedicated live release pack, and month-end filing stays under `WF-COM-001`.                                                                                                                                                                                                                 |
| `WF-FIN-GOV-001` | Governance-aware billing, reporting, and settlement enrichment            | Governed bookings retain cost-center / approval / quota attribution through invoice, report-export, settlement, and audit surfaces; the verification body stays explicit and does not collapse back into baseline `WF-FIN-001`.                            | `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`; `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`; `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.10; `support/sidecars/FIN-GOV-001/FIN-GOV-001-EVIDENCE-PACK.md` | `PASS (static evidence)`           | The spec/UAT/E2E chain now names all 13 governance verification-body fields and the shell-E2E records each field as `<value>` or `NOT_POPULATED`, but the row is not yet eligible for `PASS (live staging evidence)`: the current sidecar still records the governed staging rerun as blocked by IAP credential/ingress gates and does not yet provide a reviewer-readable live artifact proving cost-center-aware invoice/report enrichment. |

## External-Gated Families Not Counted As Repo-Only Closure

These items must stay explicit in every release statement:

| Family                                       | Why it is not repo-only closure                                                                                                             | Current anchor                                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real bank / issuer eligibility               | `WF-PRT-001` names the repo/static gate, but live issuer proof still needs real contract, sandbox credentials, and allowed test cards.      | `support/sidecars/EXT-001/EXT-001-EXTERNAL-GATE.md`; `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a; future live closeout owner: `PARTNER-ELIG-LIVE-001` |
| Grab Taiwan or equivalent live adapter proof | Needs partner API contract, credentials, webhook signature, callback, status sync, lost-race, and no-owned-assignment proof.                | `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`; `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`                                                     |
| Mobile distribution                          | Needs Expo account, Apple team, Android keystore, and tester groups.                                                                        | `docs/03-runbooks/master-system-closeout-checklist.md` §D-4a; `support/sidecars/EXT-003/EXT-003-MOBILE-DISTRIBUTION-GATE.md`                                           |
| Live CTI recording / filing activation       | Needs CTI or equivalent webhook environment, callback security, recording export, filing-package activation, and retention/access sign-off. | `support/sidecars/EXT-004/EXT-004-CTI-RECORDING-FILING-GATE.md`; `docs/04-uat/phase1-uat-checklist.md` deferred tracker; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.3     |

## Closeout Wording Rules

Good closeout language:

- "WF-ORD-001 and WF-DSP-001 are `PASS (live staging evidence)` via `E2E-001`; WF-FWD-001 remains `EXTERNAL-GATED`."
- "Billing invoice generation is live-proven under `WF-FIN-001`, while `WF-COM-001` is `PASS (sandbox evidence)` and still keeps live CTI/provider activation explicit."
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

| Family ID    | Positive evidence (baseline)                                                 | Negative-path evidence (ORX-GV-001)                                                                                                                                                                                                                                | Permission/audit evidence (ORX-GV-001)                                         | Negative-path gate read   |
| ------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------- |
| `WF-RLS-001` | CI, deploy, migration, health                                                | Rollback path named; migration down tested                                                                                                                                                                                                                         | Deploy audit trail present                                                     | `PASS (repo-local)`       |
| `WF-TEN-001` | Tenant create, bootstrap, cross-tenant isolation                             | Scope mismatch rejected (`TP-030`); suspended user blocked (`TP-031`); inactive partner blocked (`TP-032`); revoked key rejected (`NP-AUTH-001`); cross-tenant key isolation (`NP-AUTH-002`)                                                                       | Device rebind invalidation (`NP-AUTH-003`); bootstrap rejection audited        | `PASS (static evidence)`  |
| `WF-ORD-001` | Booking create, read-back, dispatch surface                                  | Address unresolvable (`TP-002`); flight number missing (`TP-004`); modify after deadline (`TP-006`)                                                                                                                                                                | Booking creation audited; modification attempt audited                         | `PASS (static evidence)`  |
| `WF-DSP-001` | Core dispatch queue, assign, reassign, and no-eligible-supply semantics      | Permission-denied assign (`NP-DSP-001`); ineligible driver reassign (`NP-DSP-002`); timeout escalation (`NP-DSP-003`); override without reason (`NP-OVR-001`); expired override revoked (`NP-OVR-003`)                                                             | Non-manager override blocked (`NP-OVR-002`); dispatch trace on failed reassign | `PASS (repo-local)`       |
| `WF-DRV-001` | Task lifecycle, platform presence, auth                                      | Trip before pickup (`DA-004`); fixed price immutable (`DA-006`); photo required (`DA-007`); signoff required (`DA-008`); expense proof required (`DA-009`); expired license blocked (`DA-022`); registration denied (`DA-024`); revoked session blocked (`DA-025`) | Driver self-scoped earnings (`DA-017`); auth denial audited                    | `PASS (static evidence)`  |
| `WF-FWD-001` | Forwarded-order mirror and external-platform boundary                        | Accept after cancellation blocked (`NP-FWD-001`); route override blocked (`NP-FWD-002`); sync failure surfaced (`NP-FWD-003`)                                                                                                                                      | Route override attempt audited                                                 | `EXTERNAL-GATED`          |
| `WF-COM-001` | Phone booking linkage, recording/proof gates, and compliance export boundary | Missing recordings flagged in filing (`NP-COM-001`); non-compliance access denied (`NP-COM-002`)                                                                                                                                                                   | Recording/report/package evidence access is audited (`SC-040`)                 | `PASS (sandbox evidence)` |
| `WF-FIN-001` | Invoice generation, report export, and sensitive artifact access             | Empty-period invoice (`NP-FIN-001`); unauthorized download blocked (`NP-FIN-002`); cross-driver earnings blocked (`NP-FIN-003`); non-finance dispute blocked (`NP-FIN-004`)                                                                                        | Download audit trail (`SC-040`); reconciliation access audited                 | `PASS (static evidence)`  |

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
- `docs/03-runbooks/prod-deploy-rollback-runbook-20260519.md`
- `docs/03-runbooks/master-system-closeout-checklist.md`
- `.github/workflows/deploy-prod.yml`
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
- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md` (`WF-PBK-001`)
- `docs/01-decisions/SD-DP-20260512-006-partner-booking-app-cutover-topology.md`
