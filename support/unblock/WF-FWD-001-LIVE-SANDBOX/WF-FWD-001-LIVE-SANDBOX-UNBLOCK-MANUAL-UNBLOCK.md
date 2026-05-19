# WF-FWD-001-LIVE-SANDBOX Manual Unblock

- Task: `WF-FWD-001-LIVE-SANDBOX-UNBLOCK-MANUAL-UNBLOCK`
- Parent: `WF-FWD-001-LIVE-SANDBOX`
- Owner: `Codex2`
- Reviewer: `Codex`
- Date: `2026-05-19`
- Status: `documented machine-truth blocker chain`

## Diagnosis

The previous unblock claim was incorrect. Current machine truth still shows the
declared dependency unresolved:

- `FWD-SPEC-001` is `backlog` in `ai-status.json`.
- `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md` is missing.
- `WF-FWD-001-LIVE-SANDBOX` still depends on `FWD-SPEC-001`, so the parent is
  not yet at the point where only partner sandbox inputs remain.

The real blocker chain is therefore two-stage:

1. Finish `FWD-SPEC-001` so the parent has its required architecture proof
   spec.
2. After that dependency is done, the task remains externally gated by the live
   forwarder sandbox package tracked in `EXT-002-BLK-001` through
   `EXT-002-BLK-007`.

## Remaining Blockers

### Stage 1: Dependency Blocker

`Codex` still needs to complete `FWD-SPEC-001` by producing:

- `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`

Until that file exists and the task moves out of `backlog`, the parent should
stay blocked on its declared dependency rather than on partner operations.

### Stage 2: External Sandbox Blocker

Once `FWD-SPEC-001` lands, the smallest remaining unblockable unit is partner
sandbox enablement for Grab Taiwan or an equivalent forwarder platform:

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

The immediate parent next step is:

> Wait for `Codex` to complete `FWD-SPEC-001` and land
> `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`. After that,
> resume `WF-FWD-001-LIVE-SANDBOX` only when the partner sandbox package is
> available: approved API contract, sandbox credentials, webhook signing
> details, and one forwarded-task seed.

Once both conditions are satisfied, resume `WF-FWD-001-LIVE-SANDBOX` with this
sequence:

1. Configure the received sandbox credential set and webhook secret in the
   staging environment.
2. Re-run the forwarder live evidence flow against the real sandbox, using
   `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` as the live
   proof checklist.
3. Collect evidence for callback lifecycle, race handling, and
   no-owned-assignment behavior to close `EXT-002-BLK-004` through
   `EXT-002-BLK-007`.

## Why No Code Change Was Needed

The blocker is status-truth correction and dependency sequencing, not runtime
repo implementation:

- The missing spec file and backlog dependency are machine-truth issues, not a
  code regression in the forwarder flow.
- Existing forwarder verification and live-evidence packets already show the
  repo can only claim mock-path or partial evidence until both the proof spec
  and partner credentials exist.
- No product semantic change was needed; the fix is to record the correct
  blocker ordering.

## Source Pointers

- `ai-status.json` entries for `FWD-SPEC-001` and `WF-FWD-001-LIVE-SANDBOX`
- `docs/03-runbooks/phase1-v3-design-blueprint-completion-wave-planning-20260519.md`
- `docs/00-context/phase1-design-blueprint-completion-directive-20260519.md`
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`
- `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md`
