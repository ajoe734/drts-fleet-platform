# WF-FWD-001-LIVE-SANDBOX Planning Decision Unblock

- Task: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-PLANNING-DECISION`
- Parent: `WF-FWD-001-LIVE-SANDBOX`
- Owner: `Codex2`
- Reviewer: `Codex`
- Date: `2026-05-19`
- Status: `no further repo-internal planning decision required`

## Decision

No additional repo-internal product or contract decision is blocking
`WF-FWD-001-LIVE-SANDBOX` after `FWD-SPEC-001`.

The required proof boundary is now formalized in
`docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`:

- sandbox harness proof is non-production only
- mock-path verification does not count as live partner closure
- live promotion requires `EXT-002-BLK-001` through `EXT-002-BLK-007`

That means the unresolved item is not a design ambiguity inside this repo. It
is external sandbox sourcing and partner authority handoff.

## Routing Outcome

Route the remaining hold back to the manual unblock / external gate path:

1. Keep `WF-FWD-001-LIVE-SANDBOX` in held `in_progress` state.
2. Treat Grab Taiwan or equivalent partner sandbox acquisition as the active
   unblock path.
3. Do not invent repo-only acceptance wording that upgrades the task without
   live credentials, callback details, and a forwarded-task seed.

## Parent Next Step

Use the parent `next` field to say:

> `FWD-SPEC-001` is complete. Remaining work is external: obtain the partner
> sandbox package tracked by `EXT-002-BLK-001` through `EXT-002-BLK-007`, then
> rerun the forwarder live evidence pack in staging.

## Why This Resolves The Planning Lane

- The proof-layer distinction is now explicit, so there is no remaining
  planning ambiguity about what counts as "done".
- The remaining blocker is not a missing architecture decision.
- Further progress depends on external inputs, not a repo-side wording choice.

## Source Pointers

- `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
