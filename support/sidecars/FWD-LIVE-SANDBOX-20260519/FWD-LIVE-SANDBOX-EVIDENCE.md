# FWD-LIVE-SANDBOX Evidence Snapshot

- Task: `WF-FWD-001-LIVE-SANDBOX`
- Owner: `Codex2`
- Reviewer: `Codex`
- Date: `2026-05-19`
- Status: `HELD pending external partner sandbox`

## Summary

This artifact records the current held-state evidence for the live forwarder
sandbox proof task.

Current branch truth after refresh:

- `FWD-SPEC-001` is complete and its formal proof-boundary artifact exists at
  `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`.
- The real forwarder adapter path is still stub-only and external-gated.
- No live partner sandbox credentials, signed webhook contract, or forwarded
  task seed are available in this repo.

## Blocking Inputs

The remaining blockers are the external gate items already tracked by
`support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`:

1. `EXT-002-BLK-001` approved partner API contract
2. `EXT-002-BLK-002` sandbox credentials and network reachability
3. `EXT-002-BLK-003` webhook signing and replay-protection details
4. `EXT-002-BLK-004` live forwarded-task seed or inbound order
5. `EXT-002-BLK-005` callback lifecycle evidence
6. `EXT-002-BLK-006` duplicate / stale / lost-race evidence
7. `EXT-002-BLK-007` no-owned-assignment live proof

## Resume Sequence

When the sandbox package arrives:

1. Configure the credentials and webhook secret in staging.
2. Re-run the live forwarder verification flow using
   `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`.
3. Replace this held snapshot with dated live evidence showing partner-path
   execution and callback outcomes.

## Evidence Boundary

This file is not a pass verdict. It exists to keep the parent artifact path
real and to anchor the held-state diagnosis in the branch.

Allowed claim:

- `WF-FWD-001-LIVE-SANDBOX` remains held pending external sandbox inputs.

Not allowed:

- live sandbox passed
- Grab Taiwan adapter is production-ready
- forwarder external gate is closed

## References

- `docs/02-architecture/forwarder-adapter-proof-spec-20260519.md`
- `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md`
- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`
- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
