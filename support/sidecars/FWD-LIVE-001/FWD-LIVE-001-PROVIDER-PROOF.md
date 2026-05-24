# FWD-LIVE-001 Provider Proof Matrix

Date: 2026-05-24
Task: `PH1GC-FWD-001`
Owner: `Codex2`
Reviewer: `Codex`
Current cycle status: `blocker`
Branch: `codex2/ph1gc-fwd-001`
Workflow family: `WF-FWD-001`
Target path: `support/sidecars/FWD-LIVE-001/`

## Verdict

Result: `PASS (repo-local)`

This folder distinguishes three evidence levels:

- `repo-local`: complete internal-mock fallback packet for `forwarder_sandbox`
- `partial external blocker evidence`: dated failed real-environment access
  attempt
- `real sandbox`: not yet present

No item below should be read as real sandbox proof unless the classification
column explicitly says `real sandbox`.

## 11-Item Proof Matrix

| Proof item | Packet status | Current evidence anchor | Classification | Notes |
| --- | --- | --- | --- | --- |
| Platform name + classification | present | `docs/02-architecture/forwarder-sandbox-provider.md`; `apps/api/src/modules/forwarder/sandbox.adapter.ts` | repo-local | `forwarder_sandbox` is the named internal-mock provider and is explicitly classified as stub-only / non-production. |
| Masked credential reference | present | `docs/02-architecture/forwarder-sandbox-provider.md`; `tests/e2e/E2E-002-forwarded-order.sh` | repo-local | The fallback packet intentionally runs without partner credentials; the proof is that this packet is an internal mock, not a partner secret path. |
| Inbound order sample | present | `tests/e2e/E2E-002-forwarded-order.sh`; `docs/02-architecture/forwarder-sandbox-provider.md` | repo-local | `POST /forwarder/orders/inbound` with `platformCode=forwarder_sandbox` is the repo-local inbound sample. |
| Accept sample | present | `tests/e2e/E2E-002-forwarded-order.sh`; `docs/02-architecture/forwarder-sandbox-provider.md` | repo-local | Driver accept is relayed through the sandbox adapter and acknowledged locally as `accept_pending`. |
| Lost-race sample | present | `docs/02-architecture/forwarder-sandbox-provider.md`; `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md` | repo-local | The harness contract names `lost_race`; the verification report cites runtime/unit coverage for terminal `lost_race`. |
| Cancel sample | present | `tests/e2e/E2E-002-forwarded-order.sh`; `docs/02-architecture/forwarder-sandbox-provider.md` | repo-local | `cancelled_by_platform` is part of the repo-local lifecycle packet. |
| Complete sample | present | `tests/e2e/E2E-002-forwarded-order.sh`; `docs/02-architecture/forwarder-sandbox-provider.md` | repo-local | `completed` sync is present in the sandbox packet and mapped to local forwarded completion. |
| Settlement sample | present | `docs/02-architecture/forwarder-sandbox-provider.md`; `tests/e2e/E2E-002-forwarded-order.sh` | repo-local | Settlement is explicitly a stub/shadow-only sample and is valid only for repo-local proof. |
| No-owned-assignment proof | present | `tests/e2e/E2E-002-forwarded-order.sh`; `tests/e2e/README.md` | repo-local | The repo-local scenario explicitly verifies that forwarded mirrors do not create owned dispatch assignments. |
| Replay / idempotency proof | present | `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md` | repo-local | The verification report cites current-HEAD replay/idempotency coverage keyed by `(platformCode, externalOrderId)`. |
| Signature proof | present | `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`; `docs/02-architecture/forwarder-sandbox-provider.md` | repo-local | Signature handling is present as repo-local verification seam and failure-path evidence; it is not a real partner-signed webhook claim. |

## Packet Reading Rules

Allowed:

- `FWD-LIVE-001 is PASS (repo-local).`
- `support/sidecars/FWD-LIVE-001/ contains all 11 directive-§D proof items as repo-local forwarder_sandbox evidence.`
- `Real partner sandbox classification is still pending.`

Not allowed:

- `Forwarder sandbox proof passed with real partner evidence.`
- `The packet proves a real third-party forwarder integration.`
- `The packet upgrades WF-FWD-001 to PASS (sandbox evidence).`

## Historical External Appendix

`support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` remains in this
folder as a dated appendix for the failed external-access attempts, including
the `2026-05-24` revalidation. It records why a real partner sandbox claim is
still blocked, but it does not negate the repo-local completeness of this
11-item fallback packet.
