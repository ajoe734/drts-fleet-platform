# PH1GC-PARTNER-002 unblock resolution

Status: resolved by the existing canonical PARTNER-ELIG-LIVE-001 evidence chain
Task: `PH1GC-PARTNER-002-UNBLOCK-MANUAL-UNBLOCK`
Dispatch parent: `PH1GC-PARTNER-002`
Canonical parent: `PARTNER-ELIG-LIVE-001`
Owner: `Codex`
Reviewer: `Codex2`

## Summary

This dispatch-level helper does not expose a new repo-local blocker.

`PH1GC-PARTNER-002` is the phase-gap-closure dispatch name for the partner live
issuer evidence sidecar that is already tracked canonically as
`PARTNER-ELIG-LIVE-001`. The repo-local contract/spec side is already complete;
the remaining gate is external-only and stays bound to `EXT-001-BLK-001`
through `EXT-001-BLK-006`.

The correct unblock action is therefore to bridge the dispatch name back to the
existing canonical task chain and keep the parent next step pointed at the
external issuer evidence packet.

## Why this helper exists

The dispatch assigned `PH1GC-PARTNER-002-UNBLOCK-MANUAL-UNBLOCK`, but that task
id does not exist in `ai-status.json`.

The actual canonical task lineage already exists under:

- `PARTNER-ELIG-LIVE-001`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION`
- `PARTNER-ELIG-LIVE-001-UNBLOCK-HISTORY-REPAIR`

Those tasks already diagnose, narrow, and document the remaining blocker. This
file is the dispatch-to-canonical bridge so the PH1GC name does not imply a
second parent or a new repo-local scope.

## Canonical evidence

1. `docs/03-runbooks/phase1-release-truth-sync-20260519.md`
   maps `WF-PARTNER-001` sidecar ownership to
   `support/sidecars/PARTNER-ELIG-LIVE-001/` and labels it
   `PH1GC-PARTNER-002`.
2. `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-MANUAL-UNBLOCK.md`
   on `origin/codex2/partner-elig-live-001-unblock-manual-unblock@052de19`
   narrows the remaining blocker to `EXT-001-BLK-001` through
   `EXT-001-BLK-006`.
3. `support/unblock/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-001-UNBLOCK-PLANNING-DECISION.md`
   on `origin/codex2/partner-elig-live-001-unblock-planning-decision@91cb3c5`
   scope-cuts further repo-local design work and routes the task to the
   existing external issuer gate.
4. `support/sidecars/PARTNER-ELIG-LIVE-001/PARTNER-ELIG-LIVE-EVIDENCE.md`
   on `origin/codex/partner-elig-live-001@2628fc7` is the canonical hold-state
   packet for the parent task.
5. `ai-status.json`
   keeps `PARTNER-ELIG-LIVE-001.next` on the concrete external resume sequence:
   keep the sidecar anchored at `2628fc7`, wait for `EXT-001-BLK-001` through
   `EXT-001-BLK-006`, attach redacted evidence there, and rerun the live issuer
   proof.

## Remaining blocker

No repo-local implementation blocker remains for this dispatch helper.

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
