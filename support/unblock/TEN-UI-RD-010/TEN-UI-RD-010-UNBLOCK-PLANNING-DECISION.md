# TEN-UI-RD-010 Unblock Planning Decision

Date: 2026-05-18
Owner: Codex2
Reviewer: Codex
Parent task: `TEN-UI-RD-010`

## Summary

The planning blocker for `TEN-UI-RD-010` is no longer a missing product or
contract decision. The canonical decision was already recorded on 2026-05-13
through 2026-05-14, and the route shipped on commit `6e0c9fd`
(`origin/codex/be-cc-001-fu-seed`).

The remaining issue is machine-truth drift: `ai-status.json` still keeps the
parent task in the 2026-05-10 `blocked` state even though the contract wave,
parity decision, implementation, review approval, and closeout packet all say
the blocker was resolved.

## Canonical Decision

`TEN-UI-RD-010` should be implemented against the published tenant booking,
cost-center, quota-preview, and approval-evaluation contracts. The UI must:

- allow booking-on-behalf metadata
- keep spend estimation as preview-only input
- omit unpublished draft-save behavior
- omit tenant-side quoted-fare override behavior
- omit tenant-side approval override behavior

This decision is already canonical in:

- `docs/05-ui/tenant-canonical-contract-gaps-design-response-20260513.md`
  (`BE-CC-001`, `BE-RULE-001`, `BE-QUOTA-001`, `BE-APR-001` unblock set)
- `docs/05-ui/tenant-console-parity-decisions-20260510.md`
  section `TEN-UI-RD-010 — TN_NewBooking contract validation`
- `docs/05-ui/tenant-console-redesign-closeout-20260514.md`
  section `TEN-UI-RD-010 — TN_NewBooking parity-fill (delegated reopen)`

## Evidence

- Contract-wave design response accepts the backend-owned governance model and
  says `TEN-UI-RD-010` must not unblock until the cost-center, rules, quota,
  and approval contracts land.
- Parity decisions now mark `TEN-UI-RD-010` as `Status: shipped` and cite the
  exact contract surface used by the route.
- The shipped implementation commit is `6e0c9fd`
  (`feat(TEN-UI-RD-010): complete tenant new booking route`).
- The closeout packet records reviewer `Codex2` approval at
  `2026-05-14T04:07:00Z` and ties the route, storybook parity story, and
  branch-of-record to the shipped outcome.

## Resolution Applied

This unblock task does not invent any new product semantics. It resolves the
planning blocker by routing the parent task back onto the already-accepted
canonical decision:

- treat the old `blocked` entry as stale machine truth
- reconcile `ai-status.json` for `TEN-UI-RD-010` with the shipped evidence
- use the shipped decision above as the parent task's concrete next step

## Parent Task Next Step

Reviewer should verify that the parent task's machine truth is updated from
the stale 2026-05-10 blocker to the shipped decision/evidence path:

- commit `6e0c9fd`
- branch `origin/codex/be-cc-001-fu-seed`
- parity decision section `TEN-UI-RD-010`
- closeout packet row `TEN-UI-RD-010`

If the reviewer agrees, `TEN-UI-RD-010` should leave the stale blocker state
and proceed through review/final closeout instead of waiting for a new product
decision from Claude.
