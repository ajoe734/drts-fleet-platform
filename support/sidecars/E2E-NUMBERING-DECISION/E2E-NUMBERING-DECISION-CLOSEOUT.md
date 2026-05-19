# E2E-NUMBERING-DECISION — Parent task closeout

Status: closed (owner closeout)
Task: `E2E-NUMBERING-DECISION`
Phase: Phase 1 v3
Owner: `Claude`
Reviewer: `Copilot`
Date: 2026-05-19

## Decision recap

User approved Q1 = **Option A** on 2026-05-19. Authoritative record lives in
`docs/00-context/phase1-v3-resolution-20260519.md` §Q1; the open-question doc
`docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` §7 marks
this question closed for revision.

Approved outcome:

| Slot      | Script                                          | State                        |
| --------- | ----------------------------------------------- | ---------------------------- |
| `E2E-007` | `tests/e2e/E2E-007-partner-airport-transfer.sh` | UNCHANGED (shipped)          |
| `E2E-008` | `tests/e2e/E2E-008-partner-booking-cutover.sh`  | UNCHANGED (shipped)          |
| `E2E-009` | `tests/e2e/E2E-009-prod-rail-dry-run.sh`        | UNCHANGED (shipped via #162) |
| `E2E-010` | `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` | NEW — implemented by `WF-FIN-GOV-001-E2E` |
| `E2E-011` | `tests/e2e/E2E-011-platform-admin-control-plane.sh`       | NEW — implemented by `WF-ADM-001-E2E`     |

## What this closeout confirms

- The three shipped E2E scripts under `tests/e2e/` (007, 008, 009) are intact;
  no rename happened, no historical evidence references were re-numbered.
- Release-gate matrix `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
  continues to cite `tests/e2e/E2E-009-prod-rail-dry-run.sh` under `WF-PROD-001`
  with the `PASS (dry-run contract evidence)` read produced by `PROD-RAIL-CLOSEOUT`.
- The two new E2E slots (`E2E-010`, `E2E-011`) are now reserved for the
  governance-billing and platform-admin work; they are not implemented by this
  task.

## Unblocked follow-on work

| Follow-on task        | What it must do                                                                                                                                     |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `REL-SYNC-001`        | Mirror Q1 into `docs/03-runbooks/phase1-release-truth-sync-20260519.md`; state shipped `E2E-007/008/009` are immutable evidence anchors.            |
| `WF-ADM-001-E2E`      | Implement `tests/e2e/E2E-011-platform-admin-control-plane.sh` per directive §3.8 with the approved numbering.                                       |
| `WF-FIN-GOV-001-E2E`  | Implement `tests/e2e/E2E-010-governance-aware-billing-reporting.sh` per directive §3.7 with the approved numbering.                                 |
| `WF-ADM-001-MATRIX`   | Add `WF-ADM-001` row referencing `E2E-011` + UAT doc.                                                                                                |
| `WF-FIN-GOV-001-MATRIX` | Add governance-aware enrichment row referencing `E2E-010`.                                                                                          |

## Prohibitions inherited from the resolution doc

- Do not rename any shipped E2E file under `tests/e2e/`.
- Do not modify historical evidence numbers in completed sidecars.
- Do not break dev's existing evidence trail to match directive numbering.

## Evidence pointers

- Authoritative decision: `docs/00-context/phase1-v3-resolution-20260519.md` §Q1
- Closed open-question record: `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` §7
- Unblock helper closeout (planning-runbook repair): `support/unblock/E2E-NUMBERING-DECISION/E2E-NUMBERING-DECISION-UNBLOCK-PLANNING-DECISION.md` on branch `origin/codex2/e2e-numbering-decision-unblock-planning-decision` at commit `d386f5d`
- Resolution + 15-follow-on registration: PR #165 (commit `2103814`)

## Reviewer checklist (Copilot)

- [ ] `tests/e2e/E2E-007-partner-airport-transfer.sh`, `E2E-008-partner-booking-cutover.sh`, `E2E-009-prod-rail-dry-run.sh` still present and unchanged in dev tip.
- [ ] `docs/00-context/phase1-v3-resolution-20260519.md` §Q1 still reads "Option A — keep existing dev numbering".
- [ ] No new commits on this task's branch alter shipped E2E filenames.
- [ ] Follow-on tasks (`REL-SYNC-001`, `WF-ADM-001-E2E`, `WF-FIN-GOV-001-E2E`) carry the same numbering in their briefs.
