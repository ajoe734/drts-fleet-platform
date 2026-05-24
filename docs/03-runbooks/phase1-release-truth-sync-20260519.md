# Phase 1 Release-Truth Sync Runbook

**Date**: 2026-05-19 (date stamped to align with directive; reconciled commit 2026-05-22)
**Authority**: directive §A `BPL-002` — `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
**Audience**: release manager, supervisor lane, Tech Lead, QA Lead
**Pairs with**: `docs/ops/branch-strategy.md` (operational branch model — this runbook does not redefine it); `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` (matrix gate reads)

This runbook declares the **release-truth role** of each branch / tag / sidecar / E2E in the Phase 1 release graph. A release manager can read this top-to-bottom and (a) know which tag means what, (b) know which row in the gate matrix to look at, (c) know what to claim and not to claim in a release announcement.

---

## 1. ID and numbering — final, no aliases

Per directive §3:

### 1.1 E2E numbering (no rename, no reuse)

| ID        | Script                                                    | Workflow family  |
| --------- | --------------------------------------------------------- | ---------------- |
| `E2E-001` | `tests/e2e/E2E-001-enterprise-dispatch.sh`                | `WF-DSP-001`     |
| `E2E-002` | `tests/e2e/E2E-002-forwarded-order.sh`                    | `WF-FWD-001`     |
| `E2E-003` | `tests/e2e/E2E-003-phone-recording-filing.sh`             | `WF-COM-001`     |
| `E2E-004` | `tests/e2e/E2E-004-tenant-attribution.sh`                 | `WF-TEN-001`     |
| `E2E-005` | `tests/e2e/E2E-005-tenant-governance.sh`                  | `WF-TGV-001`     |
| `E2E-006` | `tests/e2e/E2E-006-driver-multi-platform.sh`              | `WF-DRV-MP-001`  |
| `E2E-007` | `tests/e2e/E2E-007-partner-airport-transfer.sh`           | `WF-PARTNER-001` |
| `E2E-008` | `tests/e2e/E2E-008-partner-booking-cutover.sh`            | `WF-PBK-001`     |
| `E2E-009` | `tests/e2e/E2E-009-prod-rail-dry-run.sh`                  | `WF-PROD-001`    |
| `E2E-010` | `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` | `WF-FIN-GOV-001` |
| `E2E-011` | `tests/e2e/E2E-011-platform-admin-control-plane.sh`       | `WF-ADM-001`     |

`E2E-007`, `E2E-008`, `E2E-009` are not renamed. `E2E-010` and `E2E-011` are net-new.

### 1.2 Workflow-family ID rename

```text
WF-PRT-001  →  WF-PARTNER-001       (no alias; old references must update)
```

`WF-FIN-001` retains baseline-finance scope. `WF-FIN-GOV-001` is the new governance-aware-finance family. Do not collapse them.

### 1.3 Sixteen workflow families (final)

`WF-RLS-001`, `WF-PROD-001`, `WF-TEN-001`, `WF-ORD-001`, `WF-TGV-001`, `WF-DSP-001`, `WF-DRV-001`, `WF-DRV-MP-001`, `WF-FWD-001`, `WF-PARTNER-001`, `WF-PBK-001`, `WF-COM-001`, `WF-FIN-001`, `WF-FIN-GOV-001`, `WF-ADM-001`, `WF-REL-001`.

---

## 2. Branch / tag source-of-truth roles

Builds on `docs/ops/branch-strategy.md`. This section declares which artifact carries which kind of truth.

| Ref                     | Mutability         | Source-of-truth role                                                                                                                            | Authority                                           |
| ----------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `dev`                   | mutable            | **Engineering truth.** All worker branches PR into `dev`. Every claim of "shipped" in a closeout must resolve to a commit reachable from `dev`. | `docs/ops/branch-strategy.md` §1–§6                 |
| `publish/v<date>.<seq>` | immutable snapshot | **Nightly publish snapshot.** Created by `nightly-publish.yml`. Defines the diff window for the hourly-promote PR.                              | `docs/ops/branch-strategy.md` §5 Gate 2             |
| `main`                  | mutable            | **Promote target.** Receives squash-merged auto-publish PRs from `hourly-promote.yml`. Public-facing default branch.                            | `docs/ops/branch-strategy.md` §5 Gate 3             |
| `release/v<semver>`     | immutable          | **Release candidate.** Optional pre-prod cut for QA / external review. Not auto-deployed.                                                       | `docs/ops/branch-strategy.md` §7                    |
| `prod/v<semver>`        | immutable          | **Production deploy anchor.** Each successful production deploy stamps a `prod/v*` tag. Rollback = re-deploy prior `prod/v*`.                   | `docs/ops/branch-strategy.md` §8 + `PH1GC-PROD-001` |

### 2.1 Authority precedence (release manager order of resolution)

1. If a sidecar or runbook conflicts with `docs/ops/branch-strategy.md`, **branch-strategy wins** unless this runbook explicitly grants the sidecar/runbook authority over a named gap (none granted in Phase 1).
2. If two release-truth statements conflict on a tag's meaning, **the one closer to the leaf in the table above wins** (e.g., `prod/v*` semantics for production trumps any earlier-life-cycle claim).
3. If a release manager finds undocumented ambiguity, file the question against this runbook before stamping any new tag.

---

## 3. Matrix row mapping

Each workflow family maps to **exactly one row** in `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`. The matrix row owns the gate read; this runbook owns the release-tag role.

```text
WF-RLS-001     ↔ matrix row 1   (gate read: PASS (live staging evidence))
WF-PROD-001    ↔ matrix row 2   (gate read: PASS (production dry-run evidence))
WF-TEN-001     ↔ matrix row 3   (gate read: PASS (live staging evidence))
WF-ORD-001     ↔ matrix row 4   (gate read: PASS (live staging evidence))
WF-TGV-001     ↔ matrix row 5   (gate read: PASS (live staging evidence))
WF-DSP-001     ↔ matrix row 6   (gate read: PASS (live staging evidence))
WF-DRV-001     ↔ matrix row 7   (gate read: PASS (static evidence) or better)
WF-DRV-MP-001  ↔ matrix row 8   (gate read: PASS (sandbox + device evidence))
WF-FWD-001     ↔ matrix row 9   (gate read: PASS (sandbox evidence) minimum)
WF-PARTNER-001 ↔ matrix row 10  (gate read: PASS (sandbox evidence) minimum)
WF-PBK-001     ↔ matrix row 11  (gate read: PASS (pilot evidence))
WF-COM-001     ↔ matrix row 12  (gate read: PASS (sandbox evidence) plus live-provider non-claim)
WF-FIN-001     ↔ matrix row 13  (gate read: PASS (static evidence) or better)
WF-FIN-GOV-001 ↔ matrix row 14  (gate read: PASS (live staging evidence))
WF-ADM-001     ↔ matrix row 15  (gate read: PASS (repo-local or live staging evidence))
WF-REL-001     ↔ matrix row 16  (gate read: PASS (repo-local audit evidence))
```

A release announcement must not invent new gate reads; pull from the matrix verbatim.

---

## 4. Sidecar reference mapping

```text
WF-PROD-001     →  support/sidecars/WF-PROD-001-LIVE-EXEC/        (PH1GC-PROD-001)
WF-TGV-001      →  support/sidecars/FIN-GOV-001/ (governance reference)
                   support/sidecars/BE-CC-001/ / BE-RULE-001/ / BE-QUOTA-001/ / BE-APR-001/
WF-DRV-MP-001   →  support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/ (PH1GC-DRV-MP-002)
WF-FWD-001      →  support/sidecars/FWD-LIVE-001/                 (PH1GC-FWD-001)
WF-PARTNER-001  →  support/sidecars/PARTNER-ELIG-LIVE-001/        (PH1GC-PARTNER-002)
WF-PBK-001      →  support/sidecars/PBK-PILOT-001/                (PH1GC-PBK-001)
WF-COM-001      →  support/sidecars/WF-COM-001-LIVE-PROVIDER/     (PH1GC-COM-001)
                   support/sidecars/COM-LIVE-001/                 (existing sandbox evidence)
WF-FIN-001      →  support/sidecars/FBP-014B/                     (existing baseline)
WF-FIN-GOV-001  →  E2E-010 chain + governance-aware sidecar TBD via PH1GC-FIN-GOV-001
WF-ADM-001      →  E2E-011 chain + UAT artifact via PH1GC-ADM-001
WF-REL-001      →  this runbook
```

Sidecars listed without a `PH1GC-*` driver already exist on `origin/dev`. Sidecars listed with a `PH1GC-*` driver are not yet on `origin/dev` and must land before the matrix row gate-read can be claimed.

### 4.1 Partner-booking cutover runbook — canonical designation

The directive §F names two paths:

- `docs/03-runbooks/partner-booking-pilot-cutover-runbook-20260519.md` (already on `origin/dev`, from PBK-RUNBOOK-001)
- `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md` (driven by `PH1GC-PBK-001`)

**Canonical role assignment** (this runbook's authority):

- `partner-booking-pilot-cutover-runbook-20260519.md` is the _operational_ runbook (how to perform the cutover step-by-step on the day).
- `partner-booking-live-cutover-plan-20260519.md` is the _plan_ artifact (which partner entry, when, who, eligibility mode, rollback retention window, post-cutover monitoring) per directive §F structure.

These are complementary, not duplicates. `PH1GC-PBK-001` ships the plan; both files reference each other in their headers after `PH1GC-PBK-001` lands.

---

## 5. Non-claim wording (release announcement guardrails)

The following sentences must not appear in a Phase 1 release announcement or closeout, even if internal stakeholders feel they could:

- "Production launched" — until `WF-PROD-001` gate read flips to _live execution_ evidence (a real deploy + monitoring + human approval gate + rollback drill artifact), no.
- "Partner Booking cut over to live" — until `support/sidecars/PBK-PILOT-001/` shows one partner-entry cutover proof with ≥14-day rollback retention, no.
- "Forwarder integration live" — until `support/sidecars/FWD-LIVE-001/` carries the 11 directive-§D sandbox proof items from a real sandbox endpoint, no.
- "Partner eligibility live" — until `support/sidecars/PARTNER-ELIG-LIVE-001/` carries issuer sandbox proof from a real test-card session, no.
- "Driver multi-platform shipped" — until both `tests/e2e/E2E-006-driver-multi-platform.sh` hard-fails by default _and_ `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` carries Android + iOS install + signing + permission + push + earnings evidence, no.
- "CTI live" — until `WF-COM-001` provider classification declares live-provider with retention + legal-hold proof, no. Sandbox-provider classification with the existing `COM-LIVE-001/` packet is the maximum claim.
- "Phase 1 done" — until every PH1GC-_ row in `ai-status.json` is `done` AND every directive §10 file checkbox is checked, no. The acceptable interim phrasing is _"Phase 1 business-flow complete for pilot readiness"\* once the directive §8 conditions clear.

---

## 6. Rollback / redeploy truth

### 6.1 Rollback on dev

`dev` is not rolled back. If a worker PR introduces a regression, the fix is forward — a follow-up PR that reverts or repairs. Do not force-push `dev`. Do not delete merge commits.

### 6.2 Rollback on main / publish/v\*

`hourly-promote.yml` squash-merges into `main`. If a promote regresses, the fix is a new promote PR that reverts the regressing commit, not a force-push. `publish/v*` snapshots are immutable; do not move or delete them.

### 6.3 Rollback on prod/v\*

Per `WF-PROD-001` + `PH1GC-PROD-001`:

- Each successful production deploy stamps `prod/v<semver>`.
- Rollback = re-deploy the previously-stamped `prod/v<semver-1>` to all production Cloud Run services in scope.
- Cloud SQL migrations: any deploy that includes a migration must publish its rollback procedure in `docs/03-runbooks/production-rollback-drill-20260519.md` _before_ the deploy. A migration without a documented down-path blocks the production gate.
- Secret rotations during rollback are out of scope of this runbook; refer to incident-response procedures.

### 6.4 Redeploy without rollback

Redeploying the same `prod/v*` tag is allowed (e.g., to recover from infrastructure failure that did not touch the artifact). It does not require a new tag. The deploy log must still reference the existing tag and post-deploy smoke.

---

## 7. What this runbook does not own

- Operational branch model (lives in `docs/ops/branch-strategy.md`).
- Per-row acceptance criteria (live in `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`).
- Per-task acceptance criteria (live in `ai-status.json` `PH1GC-*` entries and `.orchestrator/task-briefs/PH1GC-*.md`).
- Incident response, SLA, or on-call (live in `docs/03-runbooks/incident-escalation-service-recovery-runbook.md` and `docs/03-runbooks/operational-sla-degradation-runbook.md`).
- Production deploy operator playbook (driven by `PH1GC-PROD-001` → `docs/03-runbooks/production-deploy-rail-spec-20260519.md`).
