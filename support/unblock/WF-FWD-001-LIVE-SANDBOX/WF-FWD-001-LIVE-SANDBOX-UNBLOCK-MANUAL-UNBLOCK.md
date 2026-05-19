# WF-FWD-001-LIVE-SANDBOX Manual Unblock

- Task: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `WF-FWD-001-LIVE-SANDBOX`
- Owner: `Codex2`
- Reviewer: `Codex`
- Date: `2026-05-19`
- Status: `documented remaining external blocker`

## Diagnosis

`WF-FWD-001-LIVE-SANDBOX` is not blocked by repo code or by its declared
dependency anymore.

- `FWD-SPEC-001` is already `done`, so the dependency gate is satisfied.
- The remaining hold is the live partner sandbox input required by the forwarder
  proof flow.
- Current repo truth still classifies the real Grab Taiwan adapter path as
  external-gated and stub-only, with live closure blocked by `EXT-002-BLK-001`
  through `EXT-002-BLK-007`.

This means the parent should stay blocked until the external partner sandbox
package exists; the unblock action for this child is to record the missing
inputs and the exact next step once they arrive.

## Remaining Blocker

The smallest unblockable unit is partner sandbox enablement for Grab Taiwan or
an equivalent forwarder platform:

1. API contract authority for the live forwarder route and callback payloads
   (`EXT-002-BLK-001`).
2. Sandbox credentials plus network access, including webhook signing secret
   and endpoint allowlist (`EXT-002-BLK-002`).
3. Signature verification and replay-protection details for live webhooks
   (`EXT-002-BLK-003`).
4. At least one route-locked forwarded task seed or inbound order in staging so
   `E2E-002` can exercise a real partner flow (`EXT-002-BLK-004`).
5. Lifecycle callback evidence for accept, reject, cancel, complete, and status
   sync (`EXT-002-BLK-005` to `EXT-002-BLK-007`).

## Concrete Parent Next Step

Once the partner owner provides the sandbox package above, resume
`WF-FWD-001-LIVE-SANDBOX` with this sequence:

1. Configure the received sandbox credential set and webhook secret in the
   staging environment.
2. Re-run the forwarder live evidence flow against the real sandbox, using
   `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` as the live
   proof checklist.
3. Collect evidence for callback lifecycle, race handling, and
   no-owned-assignment behavior to close `EXT-002-BLK-004` through
   `EXT-002-BLK-007`.

Recommended machine-truth wording for the parent:

> Await partner sandbox package for Grab Taiwan or equivalent: approved API
> contract, sandbox credentials, webhook signing details, and one forwarded-task
> seed. Once available, rerun the FWD live evidence pack in staging.

## Why No Code Change Was Needed

The blocker is external resource sourcing, not missing repo implementation:

- The chair review already classified this as `manual_unblock`, not
  `planning_decision`.
- Existing forwarder verification and live-evidence packets already show the
  repo can only claim mock-path or partial evidence until partner credentials
  exist.
- No canonical product or code document needed semantic correction for this
  unblock step.

## Source Pointers

- `ai-status.json` entry for `WF-FWD-001-LIVE-SANDBOX`
- `.orchestrator/chair-reviews/20260519T151913Z-claude.md`
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
