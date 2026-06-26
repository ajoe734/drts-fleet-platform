# P2-E2E-001 Sidecar Acceptance Packet

- Task: `P2-E2E-001-SIDECAR-ACCEPTANCE`
- Parent Task: `P2-E2E-001` — Repo-local E2E suite E2E-P2-001..010 (mock adapters)
- Helper Kind: `acceptance_packet`
- Owner: `Claude2`
- Reviewer: `Codex2`
- Phase: `phase2-tesla-fsd-sandbox-202606`
- Machine-Truth Status When Authored: `in_progress` (sidecar support, parent `in_progress`)
- Scope Guardrail: support artifact only; no canonical truth, contract, runtime, registry, or governance changes
- Mock-Evidence Caveat: this suite runs against **mock** Tesla public / regulatory / recorder adapters. Per parent acceptance and SD §5 Gate B, mock-adapter passes are **Gate-B evidence only** and must **never** be promoted to Tesla sandbox evidence.

## Acceptance Mapping (this sidecar)

| Brief Acceptance                             | Packet Coverage                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create support artifacts only                | This file is the only task artifact; it is limited to acceptance checklist, dependency map, and reviewer handoff. No source, test, contract, or status logic is changed.        |
| Do not edit canonical truth                  | No L1/L2 product truth, `apps/**` runtime, contract truth, registry, or governance files are modified. The packet only *reads* parent/dependency machine truth and git history. |
| Hand off the packet to the assigned reviewer | Owner `Claude2` hands off to reviewer `Codex2` via `scripts/ai-status.sh handoff`; the handoff is recorded in `ai-status.json` / `ai-activity-log.jsonl`.                       |

## Parent Acceptance Checklist (P2-E2E-001)

Parent single acceptance string:

> All 10 E2E scenarios green against mock adapters in CI; suite wired into include globs; each asserts fail-closed + no-FSD-fact-invention; documented as Gate-B evidence only.

Decomposed checklist for the reviewer / parent owner to confirm at parent closeout:

- [ ] All 10 scenarios `E2E-P2-001..010` exist and pass against mock adapters.
- [ ] Suite is wired into the root vitest / playwright **include globs** (not orphaned).
- [ ] Each scenario asserts **fail-closed** behavior where a gate / freshness / authorization check is missing or stale.
- [ ] Each scenario asserts **no FSD-fact-invention** — the system never fabricates Tesla FSD state, and surfaces provider-unavailable data explicitly rather than guessing.
- [ ] Suite is documented as **Gate-B (mock) evidence only**; no path promotes mock runs into Tesla sandbox evidence.
- [ ] CI (integration trunk) e2e job is **green** on the parent PR before parent handoff.

### Scenario → Dependency Map

The shared harness `apps/api/tests/integration/e2e-p2-test-helpers.ts` wires the dependency modules:
`sandbox-dispatch-gate`, `roc-operations`, `vehicle-evidence`, `accident-investigation`,
`regulatory-registry` / `regulatory-reporting`, `safety-operator`, `tesla-integration`,
`sandbox-governance`, `audit-notification`, `driver-profile`. Each scenario below maps to the
primary dependency it exercises (per parent `summary_zh`, SD test plan §1 E2E, §5 Gate B).

| Scenario file (`apps/api/tests/integration/`) | Intent                       | Primary dependency           | Module                                                |
| --------------------------------------------- | ---------------------------- | ---------------------------- | ----------------------------------------------------- |
| `e2e-p2-001-onboarding.test.ts`               | Onboarding / enrollment      | `P2-GATE-001` (enrollment)   | `sandbox-dispatch-gate` (+ `driver-profile`)          |
| `e2e-p2-002-eligibility.test.ts`              | Eligibility evaluation       | `P2-GATE-001`                | `sandbox-dispatch-gate`                               |
| `e2e-p2-003-normal-trip.test.ts`              | Normal trip dispatch         | `P2-GATE-001` (dispatch hook)| `sandbox-dispatch-gate` (+ `tesla-integration`)       |
| `e2e-p2-004-takeover-correlation.test.ts`     | Takeover correlation         | `P2-ROC-001`                 | `roc-operations` (+ `safety-operator`)                |
| `e2e-p2-005-gap-backfill.test.ts`             | Telemetry gap + backfill     | `P2-EVD-002`                 | `vehicle-evidence` (+ `tesla-integration`)            |
| `e2e-p2-006-evidence-freeze.test.ts`          | Evidence freeze + manifest   | `P2-EVD-002`                 | `vehicle-evidence`                                    |
| `e2e-p2-007-investigation-bundle.test.ts`     | Investigation bundle export  | `P2-ACC-002`                 | `accident-investigation`                              |
| `e2e-p2-008-human-fallback.test.ts`           | Human taxi fallback on AV failure | `P2-FBK-001`            | `sandbox-dispatch-gate` + `owned-mobility`            |
| `e2e-p2-009-suspend-resume.test.ts`           | Suspend + resume dispatch    | `P2-GATE-001` (hold/release) | `sandbox-dispatch-gate` (+ `sandbox-governance`)      |
| `e2e-p2-010-regulatory-reporting.test.ts`     | Regulatory report package    | `P2-REG-002`                 | `regulatory-reporting` (+ `regulatory-registry`)      |

## Dependency Map

All six declared dependencies are **`done` and reachable from `origin/dev`**. Five were
reconciled out of the live board into `ai-task-archive.jsonl`; `P2-REG-002` remains `done`
on the live board. Verified via `git log origin/dev --grep <id>` at `origin/dev` tip
`5ea613786` (2026-06-26).

| Dependency   | Status | Owner / Reviewer | dev commit (PR)                                  | Delivered module                                |
| ------------ | ------ | ---------------- | ------------------------------------------------ | ----------------------------------------------- |
| `P2-GATE-001`| done   | Codex2 / Codex   | `31d3ed308` (#892)                               | `apps/api/src/modules/sandbox-dispatch-gate/`   |
| `P2-ROC-001` | done   | Codex / Codex2   | `25d06b698` (#945)                               | `apps/api/src/modules/roc-operations/`          |
| `P2-EVD-002` | done   | Codex / Codex2   | `0661584e3` (#904)                               | `apps/api/src/modules/vehicle-evidence/`        |
| `P2-ACC-002` | done   | Codex2 / Codex   | `9de463383` (#953)                               | `apps/api/src/modules/accident-investigation/`  |
| `P2-REG-002` | done   | Codex / Codex2   | `f277e8c60` (#963)                               | `apps/api/src/modules/regulatory-reporting/`    |
| `P2-FBK-001` | done   | Codex / Codex2   | `40ee45aba` (#898), integrate `c4126ee88` (#901) | `sandbox-dispatch-gate/` + `owned-mobility/`    |

**Dependency readiness verdict:** all 6 upstream dependencies are merged to `dev`. There is
**no missing or blocked upstream** for `P2-E2E-001`. The parent is therefore unblocked on
dependencies; its only open item is its own CI / integration closeout.

### Parent Integration Status (informational, not part of this sidecar's closeout)

- Parent branch `codex2/p2-e2e-001` tip `d5539a758` ("P2-E2E-001: finalize repo-local Gate B E2E suite"), pushed to origin.
- PR `#967` open against `dev`; per parent machine-truth `next`, all required checks green **except** the CI (integration trunk) e2e job, still running as of 2026-06-26 UTC.
- Parent is **not yet** on `dev`; do not record `merged_to_dev` for the parent until PR `#967` merges. This sidecar does not gate on the parent's CI.

## Verification Notes

- Dependency commits reproduced with `git log origin/dev --oneline --grep "<id>" -i` at `origin/dev` tip `5ea613786`.
- Archived dependency records (`owner`/`reviewer`/`status`/`artifacts`) read from `ai-task-archive.jsonl`; `P2-REG-002` read from live `ai-status.json` via `scripts/ai-status.sh show`.
- Scenario file inventory and module wiring read from parent branch `origin/codex2/p2-e2e-001` (`apps/api/tests/integration/e2e-p2-*.test.ts` and `e2e-p2-test-helpers.ts`).
- No runtime build, typecheck, or test execution was performed: this task's scope is support material only and mutates no canonical truth.

## Review Trail

- `2026-06-26` — Owner `Claude2` started `P2-E2E-001-SIDECAR-ACCEPTANCE`, resolved all 6 dependencies to done-on-dev, and authored this packet.
- Pending — Owner `Claude2` hands off to reviewer `Codex2` for sidecar review.
