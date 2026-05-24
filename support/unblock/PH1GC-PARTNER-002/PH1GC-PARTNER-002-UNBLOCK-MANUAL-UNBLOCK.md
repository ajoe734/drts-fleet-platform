# PH1GC-PARTNER-002 unblock resolution

Status: resolved by canonical parent evidence already landed on 2026-05-19
Task: `PH1GC-PARTNER-002-UNBLOCK-MANUAL-UNBLOCK`
Dispatch parent: `PH1GC-PARTNER-002`
Canonical parent: `PARTNER-ELIG-LIVE-001`
Owner: `Codex`
Reviewer: `Codex2`

## Summary

This dispatch-level unblock task does not expose a new repo-local blocker.

`PH1GC-PARTNER-002` is the phase-gap-closure dispatch name for the partner live
issuer evidence sidecar that is already tracked canonically as
`PARTNER-ELIG-LIVE-001`. That canonical parent is already closed in machine
truth, and its final state is explicit:

- repo-local spec work is done via `PH1GC-PARTNER-001` /
  `PARTNER-ELIG-LIVE-001` prerequisites
- the remaining gap is external-only and stays bound to
  `EXT-001-BLK-001` through `EXT-001-BLK-006`

So the correct unblock action here is to record the mapping and point the next
step back to the existing canonical external-gate chain, not to reopen product
or contract scope.

## Why this helper was still needed

The dispatch helper now exists in `ai-status.json`, but its state still needed
to be bridged back to the pre-existing canonical partner hold lineage.

The canonical task lineage that actually owns the external issuer gate already
exists under:

- `PARTNER-ELIG-LIVE-001`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR`

Those tasks already diagnose, narrow, and document the remaining blocker.
This helper therefore serves as a dispatch-to-canonical bridge artifact.

## Regression diagnosis

The current blocker is a machine-truth regression, not a new partner-sandbox
gap.

Activity-log evidence shows this helper already reached `done` on
2026-05-23T14:51:36Z with owner closeout commit `8593a6ca` on
`origin/codex2/ph1gc-partner-002-unblock-manual-unblock`. However, the current
committed `ai-status.json` ancestry still leaves `PH1GC-PARTNER-002.next` at
the older 2026-05-22 generic "BLOCKED EXTERNAL" summary and does not carry this
helper's closeout state on the same ancestry line.

That mismatch makes the chairman see a dependency-ready blocked parent without
the already-finished dispatch bridge, so it re-created
`PH1GC-PARTNER-002-UNBLOCK-MANUAL-UNBLOCK` on 2026-05-24T14:27:30Z even though
the repo-local diagnosis had already been completed.

## Canonical evidence

1. `docs/03-runbooks/phase1-release-truth-sync-20260519.md`
   maps `WF-PARTNER-001` sidecar ownership to
   `support/sidecars/PARTNER-ELIG-LIVE-001/` and labels it
   `PH1GC-PARTNER-002`.
2. `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`
   records that after the spec dependency closed, the only remaining blocker is
   `EXT-001-BLK-001` through `EXT-001-BLK-006`.
3. `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION.md`
   scope-cuts any further repo-local design work and routes the task to the
   external issuer gate.
4. `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
   is the canonical hold-state packet for the parent task.
5. `ai-status.json`
   records `PARTNER-ELIG-LIVE-001` and its unblock helpers as `done`.

## Machine-truth repair

On 2026-05-22, the canonical `PARTNER-ELIG-LIVE-001.next` field was refreshed
to the concrete external-gate sequence required by the helper reviews:

- keep `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
  anchored at `2628fc7`
- wait for `EXT-001-BLK-001` through `EXT-001-BLK-006`
- attach redacted external evidence there
- rerun the live issuer proof

The required repair is therefore narrow: keep the existing bridge artifact,
reassert the parent task's `next` field to the canonical `EXT-001-BLK-001`
through `EXT-001-BLK-006` handoff sequence, and return this helper to normal
review/closeout flow instead of creating a second canonical parent.

## Remaining blocker

No repo-local implementation blocker remains for this dispatch task.

The only still-open inputs are the existing `EXT-001` blocker records:

- `EXT-001-BLK-001` issuer / bank API contract authority
- `EXT-001-BLK-002` sandbox credentials and network allowlist
- `EXT-001-BLK-003` issuer-approved eligible / ineligible / timeout fixtures
- `EXT-001-BLK-004` timeout and retry behavior confirmation
- `EXT-001-BLK-005` manual-review fallback business sign-off
- `EXT-001-BLK-006` sensitive-data handling and retention approval

## Unblocked next step

Treat `PH1GC-PARTNER-002` as satisfied on the repo side and resume only when an
owner can attach redacted external evidence for `EXT-001-BLK-001` through
`EXT-001-BLK-006` to:

- `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`

At that point, rerun the live issuer proof from the canonical parent task.

## Scope cut

Do not create a second canonical parent for `PH1GC-PARTNER-002`.
Do not reopen the partner spec, workflow-family naming, or repo-local sidecar
shape.
The only remaining work is external evidence collection against the existing
`PARTNER-ELIG-LIVE-001` packet.
