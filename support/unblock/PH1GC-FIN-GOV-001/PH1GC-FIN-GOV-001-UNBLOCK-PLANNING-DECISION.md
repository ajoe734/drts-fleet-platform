# PH1GC-FIN-GOV-001 Planning Decision Unblock

## Scope

- Task: `PH1GC-FIN-GOV-001-UNBLOCK-PLANNING-DECISION`
- Parent: `PH1GC-FIN-GOV-001`
- Owner: `Codex2`
- Reviewer: `Codex`
- Decision date: `2026-05-25`

## Diagnosis

The blocker was not a missing product or contract decision in the current
canonical stack. The confusion came from older planning artifacts that still
showed `WF-FIN-GOV-DECISION` as a pending human choice.

That choice has already been resolved in higher-precedence accepted planning
and implementation artifacts:

1. `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
   records the accepted outcome: keep `WF-FIN-001` baseline and add
   `WF-FIN-GOV-001` as a governance enrichment row.
2. `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
   §H explicitly says `WF-FIN-GOV-001` is independent and must **not** rename
   `WF-FIN-001`.
3. `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
   already records the governing contract: `WF-FIN-GOV-001` extends
   `WF-FIN-001` and requires the 13-field verification body whenever a booking
   is governance-aware.
4. `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md` already
   maps that 13-field contract into UAT and `E2E-010`.

## Decision

No new human product decision is required. No scope cut is required.

The canonical decision is:

1. `WF-FIN-001` remains the baseline billing/reporting workflow family.
2. `WF-FIN-GOV-001` remains a distinct governance-aware extension row.
3. Governance-aware records must assert the 13-field verification body defined
   in `governance-aware-billing-reporting-spec-20260519.md`.
4. Any remaining work is execution / evidence follow-through, not unresolved
   semantics.

## Scope Cut And Routing

- `PH1GC-FIN-GOV-001` is **not** blocked on product semantics anymore.
- No entry is added to `PHASE1_OPEN_QUESTIONS.md` because nothing remains
  unresolved.
- No decision-ledger override is needed because the accepted canonical sources
  already agree on the split: baseline `WF-FIN-001`, enrichment
  `WF-FIN-GOV-001`.
- Remaining runtime proof stays routed to the downstream execution tasks that
  consume this contract:
  - `PH1GC-E2E-010` for executable assertion of all 13 fields
  - matrix / gate-read work for `WF-FIN-GOV-001`
  - live staging evidence capture for final gate uplift

## Parent Unblocked Next Step

Update the parent task so it stops implying a missing merge or missing product
decision.

Concrete next step:

1. Treat the product/contract question as resolved by the accepted canonical
   spec and UAT now on `origin/dev`.
2. Use this artifact as the planning-decision record.
3. Close out `PH1GC-FIN-GOV-001` against the merged doc evidence on
   `origin/dev`, while leaving E2E / matrix / live-staging proof to their
   own downstream tasks instead of reopening the spec task for semantics.

## Verification Basis

- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/00-context/phase1-origin-dev-gap-closure-implementation-spec-20260520.md`
- `docs/02-architecture/governance-aware-billing-reporting-spec-20260519.md`
- `docs/04-uat/governance-aware-billing-reporting-uat-20260519.md`
- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`

## Closeout Evidence

- `origin/dev` already carries the canonical spec + UAT via commit
  `6607dea8b788ef2ab6f01a2ab14c6dbd8ab48e21`
  (`PH1GC-DOC-BATCH-1: deliver BPL-001/002/003 + PARTNER-001 + FIN-GOV-001 + ADM-001 (#237)`).
- This unblock artifact exists only to record that the remaining gap is not a
  product or contract decision. Downstream executable proof stays with
  `PH1GC-E2E-010`, the `WF-FIN-GOV-001` matrix / gate-read updates, and live
  staging evidence capture.
