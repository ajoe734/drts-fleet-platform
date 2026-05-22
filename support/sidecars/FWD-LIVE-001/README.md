# FWD-LIVE-001

Status: `repo-local proof only`

This directory records the directive-`§D` proof shape for `WF-FWD-001` using
the repo-shipped `forwarder_sandbox` provider. It does not contain partner
sandbox or live-platform evidence.

Current classification:

- workflow family: `WF-FWD-001`
- platform target: `forwarder_sandbox`
- provider classification: `repo-local harness`
- current gate read: `PASS (repo-local)`
- non-claim: Grab Taiwan or any equivalent real adapter remains
  `EXTERNAL-GATED`; do not claim sandbox or live partner proof from this
  packet.

## Contents

- `FWD-LIVE-001-EVIDENCE-PACK.md`
  - executive summary, directive-`§D` matrix, and the retained external-gate
    appendix
- `FWD-LIVE-001-PROVIDER-PROOF.md`
  - detailed proof item mapping for the repo-local `forwarder_sandbox` harness
- `PH1GC-FWD-001-CLOSEOUT-20260522.md`
  - task closeout report in directive `§7` format

## Directive §D proof matrix

| Required proof item            | Classification                  | Source                                 |
| ------------------------------ | ------------------------------- | -------------------------------------- |
| Platform name + classification | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.1  |
| Masked credential ref          | repo-local / no external secret | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.2  |
| Inbound order sample           | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.3  |
| Accept sample                  | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.4  |
| Lost-race sample               | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.5  |
| Cancel sample                  | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.6  |
| Complete sample                | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.7  |
| Settlement sample              | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.8  |
| No-owned-assignment proof      | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.9  |
| Replay / idempotency proof     | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.10 |
| Signature proof                | repo-local                      | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.11 |

## Real partner boundary

- The repo-local `forwarder_sandbox` harness satisfies the directive proof
  structure only as `repo-local` evidence.
- The real forwarder adapter gate remains open under
  `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`.
- Historical partner-endpoint probe failures from `2026-05-19` and
  `2026-05-22` are retained in `FWD-LIVE-001-EVIDENCE-PACK.md` §4 so the sidecar
  does not over-claim sandbox or live reachability.
