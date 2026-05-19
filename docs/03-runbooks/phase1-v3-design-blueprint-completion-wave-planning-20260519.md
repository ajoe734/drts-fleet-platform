# Phase 1 v3 Design Blueprint Completion Wave — Planning Runbook

**Date:** 2026-05-19
**Mode:** `supervisor_managed_execution`
**Wave name:** `phase1-v3-design-blueprint-completion`
**Source directive:** [`docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`](../00-context/phase1-design-blueprint-completion-directive-20260519.md)
**Conflicts and open questions:** [`docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md`](../00-context/phase1-v3-conflicts-and-open-questions-20260519.md)

**Predecessor waves (closed):**

- `tenant-governance-wave-202605-13` — backend governance contracts + UI shipped.
- `ui-redesign-wave-202605` — Wave 0–5 design canvas UI redesign shipped.
- `phase1-v2-business-flow-gates` — 24 P0 wave tasks merged into dev (PR #161); production rail dry-run closeout merged (PR #162); auto-promote backlog cleared (#157 merged, #159 superseded).

---

## 1. Wave purpose

The Phase 1 v2 wave landed all 24 P0 task branches into `dev` and closed `WF-PROD-001` at the contract level. The design team has now issued a directive requiring the same closeouts to be reframed at a higher abstraction: **workflow-family release gates with formal UAT scenarios, architecture specs, and explicit non-claim statements**. This wave produces the formal design artifacts that the directive requires, plus the genuinely net-new workflow families (`WF-ADM-001`, `WF-REL-001`) and gate uplifts the directive demands.

This is not "redo Phase 1 v2 work." Most of the v3 deliverables are **formalizations** of artifacts that already exist in dev. The execution strategy is to map each directive requirement to an existing artifact, file thin "see also" docs where appropriate, and write substantive new docs only where the directive demands content that doesn't yet exist.

## 2. Reconciliation map (directive demand → existing state)

### 2.1 Workflow family matrix rows

| Directive ID     | Current matrix state                                                                 | Action                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `WF-TGV-001`     | Row present, gate read `PASS (live staging evidence)` after v2                       | Add formal release-gate runbook + UAT scenarios doc (no matrix change)                           |
| `WF-DRV-MP-001`  | Row missing                                                                          | Add row + multi-platform UAT doc + mobile-distribution-gate doc                                  |
| `WF-FWD-001`     | Row present, gate read `EXTERNAL-GATED`                                              | Add forwarder-adapter-proof-spec + UAT scenarios; gate read uplift gated on real partner sandbox |
| `WF-PBK-001`     | Row present                                                                          | Existing pilot-cutover-runbook covers; add live-cutover-plan doc + UAT scenarios                 |
| `WF-PARTNER-001` | Decision resolved: rename prior `WF-PRT-001` scope to `WF-PARTNER-001`               | Use the approved Phase 1 v3 resolution and update matrix / sidecar references accordingly        |
| `WF-COM-001`     | Row present, gate read `PASS (sandbox evidence)` after v2                            | Add formal cti-recording-filing-blueprint + UAT scenarios                                        |
| `WF-FIN-GOV-001` | Decision resolved: keep `WF-FIN-001` baseline and add `WF-FIN-GOV-001` enrichment row | Add the governance-aware row as a dependent finance/governance release gate                       |
| `WF-ADM-001`     | Row missing                                                                          | Add row + UAT doc + new E2E shell                                                                |
| `WF-PROD-001`    | Row present, gate read `PASS (dry-run contract evidence)` after v2                   | Add production-deploy-rail-spec + production-rollback-drill docs                                 |
| `WF-REL-001`     | Row missing                                                                          | Add row + release-truth-sync-runbook + blueprint alignment audit                                 |

### 2.2 E2E shell scripts

| Directive demand                                  | Existing dev                                              | Status                              |
| ------------------------------------------------- | --------------------------------------------------------- | ----------------------------------- |
| `E2E-005-tenant-governance.sh`                    | present                                                   | ✓                                   |
| `E2E-006-driver-multi-platform.sh`                | present                                                   | ✓                                   |
| `E2E-002-forwarded-order.sh`                      | present                                                   | ✓ (sandbox-driven post-FWD-SBX-001) |
| `E2E-007-partner-booking-pilot.sh`                | existing `E2E-007` remains partner-airport-transfer       | directive numbering remapped; partner-booking stays on `E2E-008` |
| `E2E-008-partner-eligibility-airport-transfer.sh` | existing `E2E-008` remains partner-booking-cutover        | directive numbering remapped; airport-transfer stays on `E2E-007` |
| `E2E-003-phone-recording-filing.sh`               | present (added by `COM-E2E-003`)                          | ✓                                   |
| `E2E-009-governance-billing-reporting.sh`         | existing `E2E-009` remains prod-rail-dry-run              | governance-aware billing/reporting is assigned `E2E-010`          |
| `E2E-010-platform-admin-control-plane.sh`         | directive numbering superseded by approved remap          | platform-admin control plane is assigned `E2E-011`                |

### 2.3 Design docs (directive §6)

Directive §6 is resolved via the approved hybrid strategy in [`phase1-v3-resolution-20260519.md`](../00-context/phase1-v3-resolution-20260519.md): produce 5 substantive net-new docs and satisfy the remaining 12 required paths with thin stubs that point at canonical artifacts.

## 3. Working rules

1. **Don't redo v2 work.** Where an artifact already exists in dev under a slightly different name, write a thin pointer doc instead of duplicating.
2. **No over-claim.** Any gate uplift requires real evidence (`PASS (sandbox)` requires a sandbox callback; `PASS (live staging)` requires staging run; etc.).
3. **Branch + anchor commit + PR.** No working-tree parking.
4. **Decision blockers resolved.** The naming/numbering/docs-strategy decisions are no longer held; execute against the approved `A / A / B / C` record in [`phase1-v3-resolution-20260519.md`](../00-context/phase1-v3-resolution-20260519.md).
5. **Approved Phase 1 v3 resolution (`A / A / B / C`):**
   - E2E numbering: keep existing dev; v3's E2E-009 (gov-billing) becomes `E2E-010`, and v3's E2E-010 (admin) becomes `E2E-011`.
   - `WF-PRT-001` is renamed to `WF-PARTNER-001`.
   - `WF-FIN-001` baseline stays, and `WF-FIN-GOV-001` is added as the governance enrichment row.
   - Directive §6 docs use the hybrid strategy: 5 substantive net-new docs + 12 thin stubs.

## 4. Dispatch graph

| Order           | Tasks                                                                                                                                    | Dispatch rule                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1               | `DEV-SYNC-001`, `WF-ADM-001-MATRIX`, `WF-REL-001-MATRIX`, `WF-DRV-MP-001-MATRIX`                                                         | Genuinely net-new matrix rows + audit doc. No prereqs.                                     |
| 2               | `TGV-RUNBOOK-001`, `PBK-RUNBOOK-001`, `PROD-SPEC-001`, `PROD-DRILL-001`, `REL-SYNC-001`                                                  | Runbook docs. Reference existing artifacts. No prereqs.                                    |
| 3               | `FWD-SPEC-001`, `PRT-SPEC-001`, `COM-BLUEPRINT-001`, `FIN-GOV-SPEC-001`                                                                  | Architecture specs. Mostly formalization of existing capabilities.                         |
| 4               | `TGV-UAT-001`, `DRV-MP-UAT-001`, `PBK-UAT-001`, `PRT-UAT-001`, `COM-UAT-001`, `FIN-GOV-UAT-001`, `ADM-UAT-001`                           | UAT scenario docs. Can run in parallel.                                                    |
| 5               | `WF-ADM-001-E2E`, `WF-REL-001-AUDIT`                                                                                                     | New E2E scripts + audit reports.                                                           |
| HELD (external) | `WF-DRV-MP-001-DEVICE-EVIDENCE`, `WF-PROD-001-LIVE-EXEC`, `WF-FWD-001-LIVE-SANDBOX`, `WF-COM-001-LIVE-PROVIDER`, `PARTNER-ELIG-LIVE-001` | Hold pending external resources (physical devices, GCP prod project, partner credentials). |

## 5. Materialized P0 tasks (Phase 1 v3 wave)

### Group A — Net-new matrix rows + audit (Order 1, 4 tasks)

| ID                     | Owner  | Reviewer | What                                                                                                                                                                                |
| ---------------------- | ------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEV-SYNC-001`         | Claude | Copilot  | Produce `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`. Audit dev vs directive vs existing matrix.                                                              |
| `WF-ADM-001-MATRIX`    | Codex  | Codex2   | Add `WF-ADM-001` row to release-gate matrix. Cite forthcoming `E2E-010` (or `E2E-011` per numbering decision) + UAT doc.                                                            |
| `WF-REL-001-MATRIX`    | Codex  | Codex2   | Add `WF-REL-001` row to release-gate matrix. Cite forthcoming release-truth-sync runbook + alignment audit.                                                                         |
| `WF-DRV-MP-001-MATRIX` | Codex2 | Codex    | Add `WF-DRV-MP-001` row to release-gate matrix. Cite `E2E-006` + existing DRV-DEVICE-001 evidence pack. Remaining-non-claim explicit: real Android/iOS still HOLD pending hardware. |

### Group B — Runbook docs (Order 2, 5 tasks)

| ID                | Owner   | Reviewer | What                                                                                                                                                                             |
| ----------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TGV-RUNBOOK-001` | Codex   | Claude2  | `docs/03-runbooks/tenant-governance-workflow-release-gate-20260519.md`. Reference existing `BE-CC-001`/`RULE`/`QUOTA`/`APR-001` artifacts + `E2E-005` + `OBS-GOV-001` dashboard. |
| `PBK-RUNBOOK-001` | Claude2 | Claude   | `docs/03-runbooks/partner-booking-live-cutover-plan-20260519.md`. Either alias the existing `partner-booking-pilot-cutover-runbook-20260519.md` or merge content.                |
| `PROD-SPEC-001`   | Gemini  | Gemini2  | `docs/03-runbooks/production-deploy-rail-spec-20260519.md`. Formalize what's in `prod-deploy-rollback-runbook-20260519.md` + `PROD-RAIL-CLOSEOUT-EVIDENCE.md`.                   |
| `PROD-DRILL-001`  | Gemini2 | Gemini   | `docs/03-runbooks/production-rollback-drill-20260519.md`. New drill doc (commands exist in existing runbook; need formal drill protocol + evidence template).                    |
| `REL-SYNC-001`    | Claude  | Codex    | `docs/03-runbooks/release-truth-sync-runbook-20260519.md`. Net-new. Document dev/publish/main/prod-tag synchronization protocol.                                                 |

### Group C — Architecture specs (Order 3, 4 tasks)

| ID                  | Owner  | Reviewer | What                                                                                                                                                                        |
| ------------------- | ------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FWD-SPEC-001`      | Codex  | Codex2   | `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`. Build on existing `forwarder-sandbox-provider.md` + `FWD-VERIF-001` + `FWD-LIVE-001` sidecars.             |
| `PRT-SPEC-001`      | Codex  | Claude2  | `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md`. Consolidate `PRT-VERIF-001` + `EXT-001` evidence into formal spec.                            |
| `COM-BLUEPRINT-001` | Codex2 | Claude   | `docs/02-architecture/cti-recording-filing-blueprint-20260519.md`. Consolidate `EVD-VERIF-001` + `EXT-004` + `COM-CTI-SBX-001` + `COM-LIVE-001` artifacts.                  |
| `FIN-GOV-SPEC-001`  | Codex  | Codex2   | `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`. Build on `BE-CC-001-FU-BILLING` + `FIN-GOV-001` sidecar. Resolves `WF-FIN-GOV-001` row content. |

### Group D — UAT scenario docs (Order 4, 7 tasks in parallel)

| ID                | Owner   | Reviewer | What                                                                                                                                                     |
| ----------------- | ------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TGV-UAT-001`     | Codex2  | Claude2  | `docs/04-uat/tenant-governance-uat-scenarios-20260519.md`. Reference `TGV-NEG-001` test cases + `E2E-005`.                                               |
| `DRV-MP-UAT-001`  | Codex   | Codex2   | `docs/04-uat/driver-multi-platform-workbench-uat-20260519.md`. Include real-device scenario stubs (HOLD-pending-hardware).                               |
| `PBK-UAT-001`     | Claude2 | Claude   | `docs/04-uat/partner-booking-pilot-uat-20260519.md`. Reference `PBK-UI-004` negative paths + `E2E-008-PBK-CUTOVER`.                                      |
| `PRT-UAT-001`     | Codex   | Claude2  | `docs/04-uat/partner-eligibility-airport-transfer-uat-20260519.md`. Reference `E2E-007-PRT` + existing `partner-eligibility-manual-review-runbook.md`.   |
| `COM-UAT-001`     | Codex2  | Claude   | `docs/04-uat/cti-recording-filing-uat-20260519.md`. Reference `E2E-003-COM` + `COM-LIVE-001` sidecar.                                                    |
| `FIN-GOV-UAT-001` | Codex   | Codex2   | `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`. Reference `FIN-GOV-001` sidecar.                                                       |
| `ADM-UAT-001`     | Codex2  | Claude   | `docs/04-uat/platform-admin-control-plane-uat-20260519.md`. Net-new. Scenarios for tenant create / pricing publish / rollout stage / partner credential. |

### Group E — Net-new E2E + audit (Order 5, 2 tasks)

| ID                 | Owner  | Reviewer | What                                                                                                                                                                                                   |
| ------------------ | ------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `WF-ADM-001-E2E`   | Codex2 | Codex    | New `tests/e2e/E2E-011-platform-admin-control-plane.sh`. Cover tenant create → modules → quota → partner entry → credential → pricing publish → rollout → audit. |
| `WF-REL-001-AUDIT` | Claude | Codex    | New release-truth audit report. Cross-check dev / publish / main / prod-tag vs ai-status vs gate matrix.                                                                                               |

### HELD — Pending human resources / external resolution

| ID                              | Why HELD                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `WF-DRV-MP-001-DEVICE-EVIDENCE` | Needs physical Android + iPhone, weak-network test environment, human-in-loop                             |
| `WF-PROD-001-LIVE-EXEC`         | Needs prod GCP project + WIF + Cloud SQL + Secret Manager + GitHub Environment `production` reviewer rule |
| `WF-FWD-001-LIVE-SANDBOX`       | Needs real partner platform sandbox credentials (Grab Taiwan or equivalent)                               |
| `WF-COM-001-LIVE-PROVIDER`      | Needs CTI provider activation + webhook environment                                                       |
| `PARTNER-ELIG-LIVE-001`         | Needs real issuer/bank sandbox credentials                                                                |
| `E2E-NUMBERING-DECISION`        | Resolved on 2026-05-19: keep shipped numbering; create `E2E-010` and `E2E-011` per resolution doc       |
| `WF-PARTNER-RENAME-DECISION`    | Resolved on 2026-05-19: rename `WF-PRT-001` to `WF-PARTNER-001`                                           |
| `WF-FIN-GOV-DECISION`           | Resolved on 2026-05-19: keep `WF-FIN-001` baseline and add `WF-FIN-GOV-001`                               |
| `DOCS-STRATEGY-DECISION`        | Resolved on 2026-05-19: use 5 substantive docs + 12 thin stubs per `phase1-v3-resolution-20260519.md`    |

## 6. Workload distribution

Target ratio (`Claude:Claude2:Gemini:Gemini2:Codex:Codex2:Copilot = 10:10:5:5:35:35:5`).

| Agent   | Owns (P0 dispatchable)                                                                                                                                              | Reviews (P0 dispatchable)                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Claude  | `DEV-SYNC-001`, `REL-SYNC-001`, `WF-REL-001-AUDIT`                                                                                                                  | `PBK-RUNBOOK-001`, `COM-BLUEPRINT-001`, `COM-UAT-001`, `ADM-UAT-001`                                          |
| Claude2 | `PBK-RUNBOOK-001`, `PBK-UAT-001`                                                                                                                                    | `TGV-RUNBOOK-001`, `TGV-UAT-001`, `PRT-SPEC-001`, `PRT-UAT-001`                                               |
| Gemini  | `PROD-SPEC-001`                                                                                                                                                     | `PROD-DRILL-001`                                                                                              |
| Gemini2 | `PROD-DRILL-001`                                                                                                                                                    | `PROD-SPEC-001`                                                                                               |
| Codex   | `WF-ADM-001-MATRIX`, `WF-REL-001-MATRIX`, `TGV-RUNBOOK-001`, `FWD-SPEC-001`, `PRT-SPEC-001`, `FIN-GOV-SPEC-001`, `DRV-MP-UAT-001`, `PRT-UAT-001`, `FIN-GOV-UAT-001` | `WF-DRV-MP-001-MATRIX`, `FIN-GOV-SPEC-001` review pairs, `REL-SYNC-001`, `WF-ADM-001-E2E`, `WF-REL-001-AUDIT` |
| Codex2  | `WF-DRV-MP-001-MATRIX`, `COM-BLUEPRINT-001`, `TGV-UAT-001`, `COM-UAT-001`, `ADM-UAT-001`, `WF-ADM-001-E2E`                                                          | `WF-ADM-001-MATRIX`, `WF-REL-001-MATRIX`, `FWD-SPEC-001`, `DRV-MP-UAT-001`, `FIN-GOV-UAT-001`                 |
| Copilot | —                                                                                                                                                                   | `DEV-SYNC-001` (critique)                                                                                     |

Codex / Codex2 carry the bulk because most of v3 is docs/spec authoring, which fits their lane.

## 7. Acceptance bar for wave done

This wave is officially `done` when:

1. All 22 dispatchable P0 tasks above reach `done` in `ai-status.json`.
2. All 17 directive design-doc paths (§6) exist in dev — either as full docs or as stubs that explicitly point to the existing artifact closing their intent.
3. `phase1-workflow-acceptance-release-gates.md` carries rows for `WF-ADM-001`, `WF-REL-001`, `WF-DRV-MP-001`, and the resolution-driven `WF-PARTNER-001` / `WF-FIN-GOV-001` updates.
4. `tests/e2e/E2E-011-platform-admin-control-plane.sh` exists and passes locally.
5. The approved `A / A / B / C` decisions are reflected in the planning artifacts and task board.
6. A v3 closeout packet is written and merged.

The HELD tasks (real-device, live prod, live forwarder, live CTI, live issuer) remain HELD until external resources arrive. They are not blockers for the wave's documentation-and-rail-completion definition of done.

## 8. P1 follow-ons (out of this wave)

- `WF-DRV-MP-001-DEVICE-EVIDENCE` once devices arrive
- `WF-PROD-001-LIVE-EXEC` once GCP prod configured
- `WF-FWD-001-LIVE-SANDBOX` once partner sandbox credentials arrive
- `WF-COM-001-LIVE-PROVIDER` once CTI provider activates
- `PARTNER-ELIG-LIVE-001` once issuer credentials arrive

## 9. Notes for supervisor

- Each P0 task respects the planning-doc owner. The supervisor's auto-claim guard (`respect_explicit_owner_when_paused`, added by PR #158) prevents the paused-owner cascade.
- All design-intent changes (this runbook, conflicts doc, directive archive) follow branch + anchor commit + PR rule.
- The formerly HELD decision tasks are resolved; supervisor routing should treat the dependent documentation/matrix work as dispatchable unless separately blocked by external prerequisites.
- The 5 HELD-external tasks remain in the queue at `status=blocked` with explicit `waiting_for` set so the matrix dashboard surfaces them as pending-external.
