# TEN-UI-RD-010 Unblock Planning Decision

Date: 2026-05-18
Owner: Codex2
Reviewer: Codex
Parent task: `TEN-UI-RD-010`
Child task: `TEN-UI-RD-010-UNBLOCK-PLANNING-DECISION`

## Summary

The planning blocker for `TEN-UI-RD-010` is no longer a missing product or
contract decision. The canonical decision was already recorded on 2026-05-13
through 2026-05-14, and the route shipped on commit `6e0c9fd`
(`origin/codex/be-cc-001-fu-seed`).

The remaining issue was machine-truth drift on this worktree branch. Canonical
machine truth has now been repaired: parent task `TEN-UI-RD-010` was closed at
`2026-05-18T15:28:03Z` with merge commit `12616aa`
(`origin/codex/ten-ui-rd-010`), so this unblock task only needs to refresh the
branch-local packet and record that the planning blocker is definitively
retired.

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
- `ai-activity-log.jsonl` records a later 2026-05-16 reopen for delivery fixes
  (`71453bb`, `18bc6e0`) rather than for any reopened planning or product
  decision.

## Resolution Applied

This unblock task does not invent any new product semantics. It resolves the
planning blocker by confirming that the parent already moved onto the
already-accepted canonical decision and was then closed out:

- treat the old `blocked` branch-local entry as stale machine truth
- record in canonical planning notes that later drift is delivery-history
  repair, not a missing product decision
- keep the concrete post-unblock next step below as the reason the final
  parent closeout was valid

## Parent Task Next Step

The parent should not route back to `discussion_planning`. Its unblocked next
step was to proceed as closeout/history repair, and that step is now complete
in canonical machine truth.

Concrete next step:

1. Use the accepted shipped scope recorded in the parity decision and closeout
   packet as the source of truth.
2. Treat any missing 2026-05-16 branch anchor as delivery-history repair.
3. Re-close the parent against reachable branch evidence instead of routing it
   back to `discussion_planning`. This is now recorded in `ai-status.json` as
   commit `12616aa` on `origin/codex/ten-ui-rd-010`.

Evidence to verify while doing that repair:

- planning decision section `TEN-UI-RD-010` in
  `docs/05-ui/tenant-console-parity-decisions-20260510.md`
- closeout row `TEN-UI-RD-010` in
  `docs/05-ui/tenant-console-redesign-closeout-20260514.md`
- shipped commit `6e0c9fd`
- delivery-fix commits `71453bb` and `18bc6e0` still present in reflog/object
  history
