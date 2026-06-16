# E2E Business-Flow Verification — Iterative Plan (2026-06-15)

**Goal:** Plan E2E service verification from complete business flows, execute it,
archive plan+results, harden important flows into the deploy CI/CD gate, fix every
issue found through the normal dev flow (commit -> push -> PR -> merge -> publish),
then in each subsequent round cover what the previous round missed or deepen/widen
existing coverage. Repeat for 10 rounds.

Working model: all real work lands on `origin/dev` via the isolated worktree
`goal/e2e-business-verification-20260615` (the primary checkout sits on an active
Codex orchestrator anchor branch and must not be committed to). Local stack:
docker `drts-postgres` (5432) + a `psql` shim. The hermetic runner
(`tests/e2e/run-e2e-hermetic.sh`) resets DB + restarts API per scenario.

## Business lines under verification (the complete flow map)

| Scenario | Business line / flow                                                |
| -------- | ------------------------------------------------------------------- |
| E2E-001  | Enterprise dispatch (Line B corporate commute)                      |
| E2E-002  | Forwarded order sandbox mirror lifecycle (ops/forwarder relay)      |
| E2E-003  | Phone recording -> regulatory filing                                |
| E2E-004  | Tenant attribution                                                  |
| E2E-005  | Tenant governance (quota / approval)                                |
| E2E-006  | Driver multi-platform earnings                                      |
| E2E-007  | Partner airport transfer (Line A bank card)                         |
| E2E-008  | Partner booking cutover                                             |
| E2E-009  | Prod-rail dry run                                                   |
| E2E-010  | Governance-aware billing & reporting                                |
| E2E-011  | Platform-admin control plane (script stranded off dev - to re-land) |
| E2E-012  | Tenant business operations                                          |
| E2E-013  | Service product & eligibility                                       |
| E2E-014  | Fleet partner revenue share                                         |
| E2E-015  | Partner program variants (script stranded off dev - to re-land)     |
| E2E-016  | CRC third-party referral channel                                    |

## Round cadence (each round)

1. Plan: pick the scenarios/edges for this round.
2. Verify hermetically (reset DB + restart API per scenario).
3. Triage each failure: genuine product bug vs scenario/test bug vs env.
4. Fix genuine bugs; harden important flows into the `ci-integ.yml` e2e gate.
5. Archive plan + results under `docs/04-uat/`.
6. Land via the normal dev flow (branch -> commit -> push -> PR -> merge -> publish).

## Round ledger

- Round 1 - full-matrix baseline on current `origin/dev`; triage & fix the first
  wave of failures. Results in `e2e-business-flow-verification-results-20260615.md`.
- Rounds 2-10 - deepen/broaden per the cadence; documented as completed.
