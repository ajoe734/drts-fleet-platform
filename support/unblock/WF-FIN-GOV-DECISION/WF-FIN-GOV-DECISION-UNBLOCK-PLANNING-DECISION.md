# WF-FIN-GOV-DECISION — Unblock Planning Decision

Status: resolved
Task: `WF-FIN-GOV-DECISION-UNBLOCK-PLANNING-DECISION`
Parent: `WF-FIN-GOV-DECISION`
Decision date: `2026-05-19`

## Summary

No new product or contract decision is required. The missing planning decision was already resolved by the user-approved Phase 1 v3 reconciliation on `2026-05-19`: keep `WF-FIN-001` as the baseline finance workflow and add `WF-FIN-GOV-001` as a separate governance-aware enrichment row.

## Canonical decision record

- Conflict framing: `docs/00-context/phase1-v3-conflicts-and-open-questions-20260519.md` §2 Question 3
- Authoritative resolution: `docs/00-context/phase1-v3-resolution-20260519.md` §Q3
- Wave planning follow-through: `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md` §2.1, §3, §5

## Decision

`Q3 = B`

```text
WF-FIN-001      Baseline Billing / Invoice / Report Export
WF-FIN-GOV-001  Governance-aware Billing / Reporting / Settlement
```

`WF-FIN-GOV-001` depends on:

- `WF-TGV-001`
- `WF-FIN-001`

This helper therefore closes the planning-decision gap by routing execution back to the already-shaped downstream tasks instead of reopening product semantics.

## Scope cut

This helper does not redefine finance semantics, reopen the approved `A / A / B / C` resolution, or author the downstream deliverables owned by `Codex`.

Out of scope for this task:

- writing `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
- writing `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- adding the new workflow-family matrix row
- adding `tests/e2e/E2E-010-governance-aware-billing-reporting.sh`

## Concrete unblocked next step

With the planning decision resolved, the parent should point execution to the downstream workflow-family tasks already created from Q3:

1. `Codex` picks up `WF-FIN-GOV-001-MATRIX` to add the new governance-aware matrix row on top of the approved split (`WF-FIN-001` baseline + `WF-FIN-GOV-001` enrichment).
2. `Codex` continues `FIN-GOV-UAT-001`.
3. After `FIN-GOV-UAT-001`, `WF-FIN-GOV-001-E2E` becomes the next execution step.

## Evidence

- This unblock artifact records the decision-to-execution routing.
- Machine truth should update the parent `WF-FIN-GOV-DECISION.next` field to the concrete downstream resume path above.
