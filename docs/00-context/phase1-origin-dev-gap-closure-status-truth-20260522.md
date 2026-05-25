# Phase 1 origin/dev Gap-Closure Status Truth

**Date**: 2026-05-22
**Scope**: Reconciles the 2026-05-20 directive (`phase1-origin-dev-gap-closure-implementation-spec-20260520.md`) against the actual `origin/dev` tree state.
**Authority**: This document is the single source-of-truth for "what the directive requires vs. what is on origin/dev _right now_". The `.orchestrator/state.json` `status: done` markers below are **not** treated as proof of delivery — only files visible on `origin/dev` count.
**Read with**: `.orchestrator/task-briefs/PH1GC-*.md` (the dispatchable briefs derived from this audit).

---

## 1. Headline gap

The orchestrator marked many of the directive's deliverables as `done` (FWD-LIVE-001, PARTNER-ELIG-LIVE-001, PROD-RAIL-001, the 12 STUB-_ tasks, etc.) but the canonical artifacts at the **paths required by §4 of the directive** are missing from `origin/dev`. The merge/anchor step did not land. This audit re-issues the work under a fresh `PH1GC-_` (Phase 1 Gap Closure) namespace so the supervisor cannot confuse it with prior closeouts.

---

## 2. Required artifacts vs. `origin/dev` reality

### 2.1 Five substantive design docs (directive §4.2)

| Required path                                                                | On origin/dev? | Brief to drive remediation |
| ---------------------------------------------------------------------------- | -------------- | -------------------------- |
| `docs/00-context/origin-dev-blueprint-alignment-audit-20260519.md`           | **MISSING**    | `PH1GC-BPL-001`            |
| `docs/03-runbooks/phase1-release-truth-sync-20260519.md`                     | **MISSING**    | `PH1GC-BPL-002`            |
| `docs/02-architecture/partner-eligibility-airport-transfer-spec-20260519.md` | **MISSING**    | `PH1GC-PARTNER-001`        |
| `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`   | **MISSING**    | `PH1GC-FIN-GOV-001`        |
| `docs/04-uat/platform-admin-control-plane-uat-20260519.md`                   | **MISSING**    | `PH1GC-ADM-001`            |

### 2.2 Twelve thin stubs (directive §4.3)

`docs/00-context/stubs/` is **empty on origin/dev**. None of the twelve stubs land:

| Required stub                                      | Brief                   |
| -------------------------------------------------- | ----------------------- |
| `tenant-governance-backend-source-of-truth.md`     | `PH1GC-BPL-003` (1/12)  |
| `tenant-governance-execution-source-of-truth.md`   | `PH1GC-BPL-003` (2/12)  |
| `tenant-console-ui-source-of-truth.md`             | `PH1GC-BPL-003` (3/12)  |
| `platform-admin-ui-source-of-truth.md`             | `PH1GC-BPL-003` (4/12)  |
| `driver-app-ui-source-of-truth.md`                 | `PH1GC-BPL-003` (5/12)  |
| `partner-booking-topology-source-of-truth.md`      | `PH1GC-BPL-003` (6/12)  |
| `partner-booking-repo-local-ui-source-of-truth.md` | `PH1GC-BPL-003` (7/12)  |
| `branch-strategy-source-of-truth.md`               | `PH1GC-BPL-003` (8/12)  |
| `workflow-acceptance-matrix-source-of-truth.md`    | `PH1GC-BPL-003` (9/12)  |
| `tenant-contracts-source-of-truth.md`              | `PH1GC-BPL-003` (10/12) |
| `ui-design-canvas-source-of-truth.md`              | `PH1GC-BPL-003` (11/12) |
| `driver-app-design-canvas-source-of-truth.md`      | `PH1GC-BPL-003` (12/12) |

Pre-existing `STUB-*` tasks in `state.json` reference `stub-*-001-20260519.md` filenames; those files do not exist on `origin/dev` either, and even if recovered they do **not** match the directive's required filenames. `PH1GC-BPL-003` re-issues all twelve under the canonical names.

### 2.3 Release / UAT / E2E (directive §4.1)

| Required path                                                  | On origin/dev? | Notes                                                                                                                                       | Brief              |
| -------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` | Present        | Contains `WF-PRT-001`; missing `WF-DRV-MP-001`, `WF-FIN-GOV-001`, `WF-ADM-001`, `WF-REL-001`; rename `WF-PRT-001 → WF-PARTNER-001` per §3.2 | `PH1GC-MATRIX-001` |
| `docs/04-uat/fbp-014a-e2e-matrix.md`                           | Present        | Has E2E-001..006, 008; missing rows for E2E-007, E2E-009, E2E-010, E2E-011; needs E2E-006 warning-skip risk note                            | `PH1GC-MATRIX-002` |
| `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`      | **MISSING**    | n/a                                                                                                                                         | `PH1GC-E2E-010`    |
| `tests/e2e/E2E-011-platform-admin-control-plane.sh`            | **MISSING**    | n/a                                                                                                                                         | `PH1GC-E2E-011`    |
| `tests/e2e/E2E-006-driver-multi-platform.sh`                   | Present        | Allows warning-skip when seed is missing; directive §C demands deterministic seed mode and hard-fail default                                | `PH1GC-DRV-MP-001` |

### 2.4 External evidence packets (directive §4.4)

| Required sidecar                                  | On origin/dev?                                    | Notes                                                                                                                                                                | Brief               |
| ------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `support/sidecars/FWD-LIVE-001/`                  | Partial (1 file: `FWD-LIVE-001-EVIDENCE-PACK.md`) | Needs the §D `FWD-001` proof set (inbound/accept/lost-race/cancel/complete/settlement/no-owned-assignment/replay/signature)                                          | `PH1GC-FWD-001`     |
| `support/sidecars/PARTNER-ELIG-LIVE-001/`         | **MISSING**                                       | Issuer sandbox proof, eligible/ineligible/manual-review evidence per §E                                                                                              | `PH1GC-PARTNER-002` |
| `support/sidecars/WF-DRV-MP-001-DEVICE-EVIDENCE/` | **MISSING**                                       | Android + iOS install/signing/permission/push/network/earnings proof per §C                                                                                          | `PH1GC-DRV-MP-002`  |
| `support/sidecars/WF-COM-001-LIVE-PROVIDER/`      | **MISSING**                                       | Distinct from existing `support/sidecars/COM-LIVE-001/`; directive §G requires provider classification + retention + legal-hold proof at this exact path             | `PH1GC-COM-001`     |
| `support/sidecars/WF-PROD-001-LIVE-EXEC/`         | **MISSING**                                       | Existing `PROD-RAIL-CLOSEOUT-20260519/` and `TST-E2E-009-PROD-RAIL/` are dry-run rehearsals; directive §J requires the live-exec readiness packet at this exact path | `PH1GC-PROD-001`    |
| `support/sidecars/PBK-PILOT-001/`                 | **MISSING**                                       | Partner-entry pilot cutover + ≥14-day rollback retention proof per §F                                                                                                | `PH1GC-PBK-001`     |

### 2.5 Workflow family matrix delta (directive §2)

Current `origin/dev` matrix has 12 rows: `WF-{COM,DRV,DSP,FIN,FWD,ORD,PBK,PROD,PRT,RLS,TEN,TGV}-001`. Directive §2 mandates 16 rows.

| Workflow family  | Action                                                                       | Driven by                                   |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------------------- |
| `WF-PRT-001`     | **Rename** → `WF-PARTNER-001`, no alias retained                             | `PH1GC-MATRIX-001` + `PH1GC-PARTNER-001`    |
| `WF-DRV-MP-001`  | **Add** new row, target `PASS (sandbox + device evidence)`                   | `PH1GC-MATRIX-001` + `PH1GC-DRV-MP-001/002` |
| `WF-FIN-GOV-001` | **Add** new row depending on `WF-TGV-001` + `WF-FIN-001`                     | `PH1GC-MATRIX-001` + `PH1GC-FIN-GOV-001`    |
| `WF-ADM-001`     | **Add** new row, target `PASS (repo-local evidence)` or staging if available | `PH1GC-MATRIX-001` + `PH1GC-ADM-001`        |
| `WF-REL-001`     | **Add** new row, target `PASS (repo-local audit evidence)`                   | `PH1GC-MATRIX-001` + `PH1GC-BPL-002`        |
| `WF-PROD-001`    | Update gate read to dry-run + live-exec dual description                     | `PH1GC-MATRIX-001` + `PH1GC-PROD-001`       |
| Existing 11 rows | Keep gate reads; cross-check after each related brief lands                  | `PH1GC-MATRIX-001`                          |

### 2.6 Production deploy workflow (directive §J)

Need to confirm `.github/workflows/deploy-prod.yml` contains the PROD\_\* vars and Cloud Run / Cloud SQL / Secret Manager wiring listed in directive §J before claiming readiness. The `PH1GC-PROD-001` brief drives that audit.

---

## 3. Why orchestrator `done` markers are _not_ sufficient

For each of the following, `.orchestrator/state.json` reports `status: done`, yet `origin/dev` does not contain the directive's required canonical artifact:

```
STUB-BRANCH-STRATEGY-001    → docs/00-context/stubs/* missing entirely
STUB-TENANT-CONSOLE-UI-001  → same
STUB-PLATFORM-ADMIN-UI-001  → same
STUB-DRIVER-APP-UI-001      → same
STUB-DRIVER-CANVAS-001      → same
STUB-PBK-TOPOLOGY-001       → same
STUB-PBK-REPO-LOCAL-UI-001  → same
STUB-TENANT-CONTRACTS-001   → same
STUB-TGV-BACKEND-001        → same
STUB-TGV-EXEC-001           → same
STUB-UI-CANVAS-001          → same
STUB-WF-MATRIX-001          → same
FWD-LIVE-001                → sidecar dir has 1 file only; directive demands 11 proof items
PARTNER-ELIG-LIVE-001       → support/sidecars/PARTNER-ELIG-LIVE-001/ does not exist
PROD-RAIL-001               → support/sidecars/WF-PROD-001-LIVE-EXEC/ does not exist
FIN-GOV-SPEC-001            → docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md missing
FIN-GOV-001                 → tests/e2e/E2E-010-*.sh missing
ADM-UAT-001                 → docs/04-uat/platform-admin-control-plane-uat-20260519.md missing
COM-LIVE-001                → support/sidecars/WF-COM-001-LIVE-PROVIDER/ missing (existing COM-LIVE-001/ is different name)
PBK-CUTOVER-001             → support/sidecars/PBK-PILOT-001/ missing
QA-MATRIX-001               → matrix still has WF-PRT-001 and lacks 4 new WF rows
```

The cause is almost certainly the same multi-worker anti-pattern the user has flagged before (anchor commit + PR was skipped; design intent parked in worktree, never landed on dev). Fresh `PH1GC-*` IDs let the supervisor route the work without semantic collisions, and per-brief acceptance now mandates `git diff origin/dev -- <path>` showing the file as added.

---

## 4. PH1GC-\* brief map (dispatch order)

These are the briefs the supervisor will dispatch. Phase letters mirror directive §5.

| #   | Brief               | Phase | Spec ref       | Suggested lane (subject to supervisor reshuffle) | Depends on                                     |
| --- | ------------------- | ----- | -------------- | ------------------------------------------------ | ---------------------------------------------- |
| 1   | `PH1GC-BPL-001`     | A     | §A BPL-001     | Codex                                            | —                                              |
| 2   | `PH1GC-BPL-002`     | A     | §A BPL-002     | Codex2                                           | PH1GC-BPL-001                                  |
| 3   | `PH1GC-BPL-003`     | A     | §A BPL-003     | Codex                                            | —                                              |
| 4   | `PH1GC-MATRIX-001`  | B     | §B MATRIX-001  | Codex2                                           | PH1GC-BPL-002 (for terminology)                |
| 5   | `PH1GC-MATRIX-002`  | B     | §B MATRIX-002  | Codex2                                           | PH1GC-MATRIX-001, PH1GC-E2E-010, PH1GC-E2E-011 |
| 6   | `PH1GC-E2E-010`     | B/H   | §B+§H          | Codex                                            | PH1GC-FIN-GOV-001 (spec doc)                   |
| 7   | `PH1GC-E2E-011`     | B/I   | §B+§I          | Codex                                            | PH1GC-ADM-001 (UAT doc)                        |
| 8   | `PH1GC-DRV-MP-001`  | C     | §C DRV-MP-001  | Codex                                            | —                                              |
| 9   | `PH1GC-DRV-MP-002`  | C     | §C DRV-MP-002  | Codex2                                           | external device access                         |
| 10  | `PH1GC-FWD-001`     | D     | §D FWD-001     | Codex                                            | external sandbox creds                         |
| 11  | `PH1GC-PARTNER-001` | E     | §E PARTNER-001 | Codex2                                           | —                                              |
| 12  | `PH1GC-PARTNER-002` | E     | §E PARTNER-002 | Codex                                            | issuer sandbox creds                           |
| 13  | `PH1GC-PBK-001`     | F     | §F PBK-001     | Codex2                                           | partner entry pilot owner                      |
| 14  | `PH1GC-COM-001`     | G     | §G COM-001     | Codex                                            | provider classification info                   |
| 15  | `PH1GC-FIN-GOV-001` | H     | §H FIN-GOV-001 | Codex2                                           | —                                              |
| 16  | `PH1GC-ADM-001`     | I     | §I ADM-001     | Codex2                                           | —                                              |
| 17  | `PH1GC-PROD-001`    | J     | §J PROD-001    | Codex                                            | GCP project owner                              |

Lane suggestions follow the documented agent workload ratio (Codex/Codex2 carry 70 % of the queue), with the supervisor free to reshuffle via availability-first auto-claim. Workers must read this status-truth doc plus the directive before claiming.

---

## 5. Definition of Done for the gap-closure pass

Phase 1 gap closure is complete only when **every** row in §2 above flips to `Present on origin/dev` and matches the directive's content acceptance, **and**:

1. The 8 directive-§10 file boxes are all checked.
2. Matrix shows 16 rows with no `WF-PRT-001`.
3. E2E matrix shows entries for 001..011.
4. `E2E-006-driver-multi-platform.sh` hard-fails by default without seed.
5. Each closeout report follows the directive §7 format.
6. No brief is marked `done` unless `git ls-tree -r origin/dev -- <required-path>` returns the file.
