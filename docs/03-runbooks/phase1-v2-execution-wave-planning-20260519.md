# Phase 1 v2 Execution Wave — Planning Packet (2026-05-19)

**Date:** 2026-05-19
**Mode:** `supervisor_managed_execution`
**Wave name:** `phase1-v2-business-flow-gates`
**Product source:**

- `phase1_complete_sa_v2_20260519.md` (system analysis v2)
- `phase1_complete_sd_v2_20260519.md` (system design v2)
- `phase1_complete_sasd_package_index_20260519.md` (package index)

**Predecessor waves (closed):**

- `tenant-governance-wave-202605-13` — backend governance contracts + UI shipped.
- `ui-redesign-wave-202605` — Wave 0–5 design canvas UI redesign shipped.

**Scope:** convert remaining repo-local closeouts into workflow-family gates
with E2E coverage, evidence packs, and a production deploy rail. This is the
wave that takes Phase 1 from "feature-complete in repo" to "business-flow
complete with named gates".

---

## 1. Purpose

The v2 SA/SD pair recasts Phase 1 completion in terms of **workflow-family
release gates**, not individual UI / backend tickets. The current `origin/dev`
state has:

- Tenant Governance backend (`BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`,
  `BE-APR-001`) — `done`.
- Tenant Governance UI (`TEN-UI-RD-010/013/014`, `ADM-UI-GOV-001`) — `done`.
- Driver multi-platform implementation (`DRV-MP-001..010`) — `done`, with
  `DRV-VERIF-001` verification sidecar.
- Partner Booking white-label app (`PBK-UI-001..005`) — `done`, plus
  `SD-DP-20260512-006` cutover topology decision.
- Forwarder stub adapter + `EXT-002` external-gated packet.
- CTI / filing under `EXT-004-CTI-RECORDING-FILING-GATE` HOLD.
- Production deploy `.github/workflows/deploy-prod.yml` in **SKELETON**
  status (validate-config rejects until prod GCP / WIF / Cloud SQL secrets
  exist).

What is still missing per SA v2 §5 "Phase 1 完成定義":

- New workflow-family rows in
  `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` for
  Tenant Governance, Driver Multi-Platform, Partner Eligibility, Partner
  Booking Cutover, Production Rail.
- E2E shell coverage for those families (`E2E-005..009`).
- Live evidence packs for forwarder, partner eligibility, CTI/filing,
  governance-aware billing, prod deploy rail.
- Designated pilot partner entry with `cutoverOwner` / `rollbackOwner` and
  rollback drill evidence.
- Production deploy rail completion.

This packet materializes those gaps into 14 P0 tasks.

## 2. Current Truth (per origin/dev @ 2026-05-19)

| Workflow family                   | SA v2 ID         | Existing gate read             | Required v2 gate                                                                       |
| --------------------------------- | ---------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| Runtime/deploy/release foundation | `WF-RLS-001`     | `PASS (live staging evidence)` | `PASS (live production evidence)` after `PROD-RAIL-001`                                |
| Tenant bootstrap & boundary       | `WF-TEN-001`     | `PASS (live staging evidence)` | unchanged                                                                              |
| Booking intake                    | `WF-ORD-001`     | `PASS (live staging evidence)` | unchanged                                                                              |
| Core dispatch                     | `WF-DSP-001`     | `PASS (live staging evidence)` | unchanged                                                                              |
| Driver owned task                 | `WF-DRV-001`     | `PASS (static evidence)`       | unchanged                                                                              |
| Forwarder                         | `WF-FWD-001`     | `EXTERNAL-GATED`               | live sandbox + adapter proof via `FWD-LIVE-001`                                        |
| CTI / filing                      | `WF-COM-001`     | `HOLD`                         | live activation + sidecar via `COM-LIVE-001`                                           |
| Billing / reporting               | `WF-FIN-001`     | `PASS (static evidence)`       | live cost-center-aware proof via `FIN-GOV-001`                                         |
| Tenant governance (new)           | `WF-TGV-001`     | not yet listed                 | `PASS (live staging evidence)` via `TST-E2E-005-TGV`                                   |
| Driver multi-platform (new)       | `WF-DRV-MP-001`  | not yet listed                 | `PASS (live staging evidence)` via `TST-E2E-006-DRV-MP`                                |
| Partner eligibility/airport (new) | `WF-PARTNER-001` | not yet listed                 | mock-mode `PASS (repo-local)` + live `EXTERNAL-GATED` via `TST-E2E-007-PRT`            |
| Partner Booking cutover (new)     | `WF-PBK-001`     | not yet listed                 | runbook + rollback drill via `PBK-CUTOVER-001` + `TST-E2E-008-PBK-CUTOVER`             |
| Production deploy rail (new)      | `WF-PROD-001`    | not yet listed                 | `deploy-prod.yml` job-complete + dry-run via `PROD-RAIL-001` + `TST-E2E-009-PROD-RAIL` |

## 3. Global Worker Rules

Every worker on this wave must:

- Read `phase1_complete_sa_v2_20260519.md` and
  `phase1_complete_sd_v2_20260519.md` before touching their task.
- Stay inside the assigned write scope listed in each task brief.
- Treat workflow-family gates as the unit of release, not individual files.
- Never claim live activation when only mock-mode runs are present; use the
  `PASS (repo-local) / EXTERNAL-GATED` vocabulary from
  `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`.
- When a task touches design intent (planning runbook, supervisor config,
  workflow matrix), follow the branch + anchor commit + PR rule. No working
  tree parking.
- Run task-scoped verification commands listed in each brief. Report
  blockers honestly — do not invent live evidence.

## 4. Dispatch Graph

| Order | Tasks                                                                                                                        | Dispatch rule                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1     | `DEV-STATUS-001`, `WF-TGV-001`, `WF-DRV-MP-001`, `WF-PARTNER-001`, `PROD-RAIL-001`                                           | Can start immediately. Independent design/matrix work.       |
| 2     | `TST-E2E-005-TGV`, `TST-E2E-006-DRV-MP`, `TST-E2E-007-PRT`, `PBK-CUTOVER-001`, `COM-LIVE-001`, `FWD-LIVE-001`, `FIN-GOV-001` | Wait for the relevant matrix row (WF-\*) to land.            |
| 3     | `TST-E2E-008-PBK-CUTOVER`, `TST-E2E-009-PROD-RAIL`                                                                           | Wait for `PBK-CUTOVER-001` and `PROD-RAIL-001` respectively. |

## 5. Materialized Tasks (P0 — 14 total)

### Group A — Workflow Family Gates (5 tasks)

| ID                | Owner   | Reviewer | What                                                                                                                                                                                                                              |
| ----------------- | ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WF-TGV-001`      | Codex   | Codex2   | Add Tenant Governance row to release-gates matrix; cite `BE-CC-001`/`RULE`/`QUOTA`/`APR-001` and the forthcoming `E2E-005` script.                                                                                                |
| `WF-DRV-MP-001`   | Codex2  | Codex    | Add Driver Multi-Platform row to matrix; cite `DRV-MP-001..010` + `DRV-VERIF-001` and `E2E-006`.                                                                                                                                  |
| `WF-PARTNER-001`  | Codex   | Claude2  | Add Partner Eligibility / Airport Transfer row to matrix; cite `PRT-VERIF-001` and `E2E-007`.                                                                                                                                     |
| `PBK-CUTOVER-001` | Claude2 | Claude   | Add `WF-PBK-001` row + write partner-entry cutover runbook per `SD-DP-20260512-006`. Pick pilot partner entry, name `cutoverOwner` / `rollbackOwner`, document rollback drill.                                                    |
| `PROD-RAIL-001`   | Gemini  | Gemini2  | Add `WF-PROD-001` row + complete `.github/workflows/deploy-prod.yml`. Configure prod GCP project, WIF, Cloud SQL, Secret Manager, Artifact Registry. Copy build-push + deploy jobs from staging. Add GitHub Environment reviewer. |

### Group B — E2E Shell Coverage (5 tasks)

| ID                        | Owner   | Reviewer | What                                                      |
| ------------------------- | ------- | -------- | --------------------------------------------------------- |
| `TST-E2E-005-TGV`         | Codex   | Claude2  | Implement `tests/e2e/E2E-005-tenant-governance.sh`.       |
| `TST-E2E-006-DRV-MP`      | Gemini2 | Codex    | Existing brief — promote to active, complete script.      |
| `TST-E2E-007-PRT`         | Codex   | Claude2  | Existing brief — promote to active, complete script.      |
| `TST-E2E-008-PBK-CUTOVER` | Codex2  | Claude2  | Implement `tests/e2e/E2E-008-partner-booking-cutover.sh`. |
| `TST-E2E-009-PROD-RAIL`   | Gemini2 | Gemini   | Implement `tests/e2e/E2E-009-prod-rail-dry-run.sh`.       |

### Group C — Live Evidence Packs (3 tasks)

| ID             | Owner   | Reviewer | What                                                                                                                                                                                      |
| -------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FWD-LIVE-001` | Gemini2 | Codex    | Resolve 7 `EXT-002-BLK-*` blockers and produce `support/sidecars/FWD-LIVE-001/` live forwarder evidence pack. If credentials still pending, file partial pack listing remaining blockers. |
| `COM-LIVE-001` | Gemini  | Claude   | CTI / recording / filing live activation. Produce `support/sidecars/COM-LIVE-001/` evidence pack. If CTI webhook environment still pending, document partial mode.                        |
| `FIN-GOV-001`  | Codex   | Codex2   | Governance-aware billing/reporting live evidence. Produce `support/sidecars/FIN-GOV-001/` covering cost-center enriched invoice, quota usage report, approval audit chain.                |

### Group D — Status Truth (1 task)

| ID               | Owner  | Reviewer | What                                                                                                                                                         |
| ---------------- | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEV-STATUS-001` | Claude | Copilot  | Anchor `phase1-v2-status-truth-20260519.md` summarizing v2 gate reads, sprint switch to `phase1-v2-business-flow-gates`, and active slice plan for the wave. |

## 6. Workload Distribution

Target ratio (per durable preference): `Claude:Claude2:Gemini:Gemini2:Codex:Codex2:Copilot = 10:10:5:5:35:35:5`.

| Agent   | Owns (P0)                                                                           | Reviews (P0)                                                    |
| ------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Claude  | `DEV-STATUS-001`                                                                    | `PBK-CUTOVER-001`, `COM-LIVE-001`                               |
| Claude2 | `PBK-CUTOVER-001`                                                                   | `TST-E2E-005-TGV`, `TST-E2E-007-PRT`, `TST-E2E-008-PBK-CUTOVER` |
| Gemini  | `PROD-RAIL-001`, `COM-LIVE-001`                                                     | `TST-E2E-009-PROD-RAIL`                                         |
| Gemini2 | `TST-E2E-006-DRV-MP`, `FWD-LIVE-001`, `TST-E2E-009-PROD-RAIL`                       | `PROD-RAIL-001`                                                 |
| Codex   | `WF-TGV-001`, `WF-PARTNER-001`, `TST-E2E-005-TGV`, `TST-E2E-007-PRT`, `FIN-GOV-001` | `WF-DRV-MP-001`, `TST-E2E-006-DRV-MP`, `FWD-LIVE-001`           |
| Codex2  | `WF-DRV-MP-001`, `TST-E2E-008-PBK-CUTOVER`                                          | `WF-TGV-001`, `FIN-GOV-001`                                     |
| Copilot | —                                                                                   | `DEV-STATUS-001` (critique role)                                |

Codex / Codex2 carry the heaviest load because the bulk of group A/B is
contracts/matrix/E2E surface work. Group C live-evidence work is biased to
Gemini / Gemini2 because it is environment + adapter activation.

## 7. P1 — Pilot Maturity (out of this wave's release bar, but next on deck)

These are tracked but not included as P0 in this wave:

- `DRV-DIST-001` Android / iOS distribution
- `PARTNER-ELIG-LIVE-001` real issuer / bank credentials
- `OPS-APPROVAL-001` approval queue operational signoff
- `ADAPTER-HEALTH-001` partner adapter health dashboard
- `CUTOVER-ROLLBACK-001` rollback drill for partner entry (drill itself, beyond runbook)

A follow-on packet should pick these up once Group A–D land.

## 8. P2 — Phase 2 Backlog (deliberately deferred)

Listed for traceability only. Do not open as Phase 1 tasks:

`APR-CHAIN-001` (ordered_chain approval), `APR-CRON-001` (automated timeout),
`CC-HIER-001` (parent cost-center hierarchy), `QUOTA-PERIOD-001` (quarterly /
yearly quota), `RULE-TIME-001` (time-of-day / weekend), `BULK-IMPORT-001`
(CSV upload), `AV-FUTURE-001` (self-driving showcase).

## 9. Acceptance Bar for Wave Done

This wave is officially `done` when **all** of the following are true:

1. All 14 P0 tasks reach `done` in `ai-status.json`.
2. `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` carries
   rows for `WF-TGV-001`, `WF-DRV-MP-001`, `WF-PARTNER-001`, `WF-PBK-001`,
   `WF-PROD-001` with explicit gate reads.
3. `tests/e2e/E2E-005..009` exist and pass in their declared modes
   (repo-local / mock / live where activated).
4. `support/sidecars/FWD-LIVE-001/`, `support/sidecars/COM-LIVE-001/`,
   `support/sidecars/FIN-GOV-001/` exist with explicit gate-read verdicts.
5. `.github/workflows/deploy-prod.yml` no longer self-identifies as
   `SKELETON`; `validate-config` succeeds for the configured prod project.
6. A Phase 1 v2 closeout packet (analogous to
   `tenant-governance-wave-closeout-20260514.md`) is written and merged.

External-gated subsets (live forwarder, live CTI, live issuer credentials)
remain explicit `EXTERNAL-GATED` until their respective blockers clear.
That is fine — the wave does not require those to be live. It requires the
gate-read vocabulary to be correct.

## 10. Notes for Supervisor

- Respect each task brief's `Owner` field. Do **not** auto-claim by
  availability — that has caused thrashing in prior waves. See
  `.claude/projects/-home-edna-workspace-drts-fleet-platform/memory/feedback_supervisor_ignores_explicit_owner.md`.
- All design-intent changes in this wave (planning runbook, matrix rows,
  task briefs, ai-status.json updates) must land via branch + commit + PR.
  No working tree parking.
- Group C live-evidence tasks may legitimately end in
  `PASS (repo-local) + EXTERNAL-GATED` if external credentials are still
  pending. That counts as `done` for this wave, as long as the sidecar
  pack documents what is missing.
