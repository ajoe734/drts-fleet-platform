# FWD-LIVE-001 Provider Proof Matrix

Date: 2026-05-23
Task: `PH1GC-FWD-001`
Owner: `Codex2`
Reviewer: `Codex`
Workflow family: `WF-FWD-001`
Target path: `support/sidecars/FWD-LIVE-001/`

## Verdict

Result: `real sandbox proof missing`

This folder now distinguishes three evidence levels:

- `repo-local`: deterministic `forwarder_sandbox` harness evidence
- `partial external blocker evidence`: failed real-environment access attempt
- `real sandbox`: not yet present

No item below should be read as real sandbox proof unless the status column
explicitly says `present`.

## 11-Item Proof Matrix

| Proof item | Real sandbox status | Current evidence anchor | Classification | Notes |
| --- | --- | --- | --- | --- |
| Platform name + classification | missing | `docs/02-architecture/forwarder-sandbox-provider.md`; `apps/api/src/modules/forwarder/sandbox.adapter.ts` | repo-local only | The only fully documented provider in repo is `forwarder_sandbox`, explicitly marked non-production and stub-only. |
| Masked credential reference | missing | `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` §3 | partial external blocker evidence | The pack records `gcloud` auth presence plus non-interactive token-mint failure; no partner sandbox credential reference is available. |
| Inbound order sample | missing | `tests/e2e/E2E-002-forwarded-order.sh`; `docs/04-uat/fbp-014a-e2e-matrix.md` §4.2 | repo-local only | Current inbound sample is generated for `forwarder_sandbox`, not from a real partner sandbox endpoint. |
| Accept sample | missing | `tests/e2e/E2E-002-forwarded-order.sh`; `apps/api/src/modules/forwarder/sandbox.adapter.ts` | repo-local only | Accept relay is acknowledged by a local stub adapter only. |
| Lost-race sample | missing | `docs/02-architecture/forwarder-sandbox-provider.md`; `apps/api/tests/unit/forwarder.service.test.ts` | repo-local only | Lost-race is modeled and unit-tested locally, but no real sandbox callback sample exists. |
| Cancel sample | missing | `tests/e2e/E2E-002-forwarded-order.sh` | repo-local only | Cancelled-by-platform path is covered in the local harness only. |
| Complete sample | missing | `tests/e2e/E2E-002-forwarded-order.sh` | repo-local only | Completed sync is exercised in the local harness only. |
| Settlement sample | missing | `docs/02-architecture/forwarder-sandbox-provider.md`; `tests/e2e/E2E-002-forwarded-order.sh` | repo-local only | Settlement is a stub fixture (`shadow_only`), not a real sandbox settlement import. |
| No-owned-assignment proof | missing | `tests/e2e/E2E-002-forwarded-order.sh`; `tests/e2e/README.md` | repo-local only | The repo-local guard is present, but no real sandbox forwarded order has been observed staying outside owned dispatch. |
| Replay / idempotency proof | missing | `apps/api/tests/unit/forwarder.service.test.ts`; `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md` | repo-local only | Replay/idempotency is proven by unit tests on current `HEAD`, not by a real sandbox delivery. |
| Signature proof | missing | `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md`; `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-EVIDENCE-PACK.md` | repo-local only / blocker | Runtime verification seam exists, but the shipped adapter remains stub-only and no real signed sandbox webhook has been captured. |

## External Blocker Summary

The current blocker set remains the same as `EXT-002-BLK-001` through
`EXT-002-BLK-007`:

- approved partner API contract authority is absent
- sandbox credentials / network reachability are absent
- webhook signature / replay proof is absent
- live inbound forwarded-task seed is absent
- callback lifecycle samples are absent
- lost-race / duplicate callback proof is absent
- no-owned-assignment proof on a real forwarded task is absent

## Allowed Release Reading

Allowed:

- `WF-FWD-001 remains EXTERNAL-GATED.`
- `support/sidecars/FWD-LIVE-001/ contains repo-local harness evidence plus a dated failed-attempt packet, not real sandbox proof.`

Not allowed:

- `Forwarder sandbox proof passed.`
- `The provider proof packet contains all 11 sandbox items.`
- `The current sidecar proves a real third-party forwarder integration.`
