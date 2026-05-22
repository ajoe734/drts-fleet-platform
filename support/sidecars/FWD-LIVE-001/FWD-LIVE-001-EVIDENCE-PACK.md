# FWD-LIVE-001 — Forwarder Repo-local Proof Pack

**Task:** `PH1GC-FWD-001`<br>
**Owner:** `Codex`<br>
**Reviewer:** `Codex2`<br>
**Updated:** `2026-05-22 (UTC)`<br>
**Status:** `repo-local proof only`

---

## 1. Executive Summary

This packet records the current accepted proof posture for `WF-FWD-001`.

Current result on this branch:

- `WF-FWD-001` is documented as `PASS (repo-local)`.
- The proof target is the repo-shipped `forwarder_sandbox` provider, not Grab
  Taiwan or another real partner sandbox.
- The directive-`§D` proof structure is satisfied inside the repo by the
  deterministic `E2E-002` flow, sandbox fixtures, and forwarder service unit
  coverage.
- No partner credential, live webhook signature, or real sandbox endpoint claim
  is made in this packet.

Conclusion:

- This sidecar now names all 11 directive-`§D` proof items as
  `repo-local` evidence.
- Real partner sandbox and live-adapter proof remain external-gated under
  `EXT-002-BLK-001` through `EXT-002-BLK-007`.

---

## 2. Workflow Declaration

- Workflow family: `WF-FWD-001`
- Business flow: `Forwarded-order mirror and external-platform boundary`
- Current gate read: `PASS (repo-local)`
- Evidence level: `repo-local`
- Verification path:
  `support/sidecars/FWD-LIVE-001/FWD-LIVE-001-PROVIDER-PROOF.md`,
  `tests/e2e/E2E-002-forwarded-order.sh`,
  `apps/api/tests/unit/forwarder.service.test.ts`,
  `docs/02-architecture/forwarder-sandbox-provider.md`
- Non-claim:
  `This packet does not prove a real partner sandbox, a live staging adapter,
real credentials, signed webhook traffic from an external provider, or
production readiness for Grab Taiwan or any equivalent platform.`
- Next action:
  `If a real partner sandbox package becomes available later, collect a new
sidecar packet with masked credential refs, signed callbacks, settlement
rows, and no-owned-assignment proof from that external endpoint before making
any sandbox/live claim.`

---

## 3. Directive §D Proof Matrix

| Proof item                     | Current source                                                                 | Classification | Detailed anchor                        |
| ------------------------------ | ------------------------------------------------------------------------------ | -------------- | -------------------------------------- |
| Platform name + classification | `forwarder_sandbox` provider capability summary and provider note              | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.1  |
| Masked credential ref          | Stub auth / credential / webhook state only; no external secret path           | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.2  |
| Inbound                        | `E2E-002` Leg 1 inbound fixture + mirror creation                              | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.3  |
| Accept                         | `E2E-002` Leg 3 accept relay + service test accept path                        | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.4  |
| Lost-race                      | Forwarder service unit coverage                                                | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.5  |
| Cancel                         | `E2E-002` Leg 4 cancellation path                                              | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.6  |
| Complete                       | `E2E-002` Leg 3 completed sync + sandbox fixture                               | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.7  |
| Settlement                     | `E2E-002` settlement matrix row + sandbox adapter earnings sample              | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.8  |
| No-owned-assignment            | `E2E-002` Leg 5 dispatch-task guard                                            | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.9  |
| Replay / idempotency           | Forwarder service unit coverage                                                | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.10 |
| Signature                      | Forwarder service verification failure path + sandbox stub verification status | `repo-local`   | `FWD-LIVE-001-PROVIDER-PROOF.md` §2.11 |

---

## 4. Retained External-Gate Appendix

The earlier external probe history is retained here because it still explains
why this task stops at `repo-local` instead of claiming real sandbox evidence.

Observed on `2026-05-19` and revalidated on `2026-05-22`:

- `gcloud auth print-identity-token` failed with non-interactive
  reauthentication required.
- `gcloud run services list` and `gcloud secrets list` failed behind the same
  auth boundary.
- `https://drts-api-kdhu6wzufa-uc.a.run.app/`,
  `/health`, and `/api/health` returned HTTP `404`.
- `api-staging.drts.internal` returned `NXDOMAIN`.
- `https://api.staging.drts-fleet.cctech-support.com/` and `/api/health`
  resolved, but both redirected to Google IAP and the token-helper paths still
  failed because the local `gcloud` session required reauthentication.

These observations mean:

- no real partner sandbox endpoint was reachable from this workspace
- no masked credential reference or secret-version path was surfaced
- no signed callback, replay-denial sample, settlement import row, or live
  no-owned-assignment proof could be collected from an external system

The real partner gate therefore remains explicit in:

- `support/sidecars/EXT-002/EXT-002-FORWARDER-ADAPTER-GATE.md`
- `docs/03-runbooks/cross-repo-gap-matrix-20260424.md`

---

## 5. Relationship To Existing Evidence

- `support/sidecars/FWD-VERIF-001/FWD-VERIF-001-VERIFICATION.md` remains the
  source-review and unit-test verification artifact for the forwarder module
  seam.
- `docs/02-architecture/forwarder-sandbox-provider.md` remains the canonical
  note that `forwarder_sandbox` is a non-production harness.
- This packet upgrades the current sidecar from "partial external probe only"
  to a complete repo-local proof map without pretending that the repo-local
  harness is a partner sandbox.

---

## 6. Verification Snapshot On 2026-05-22

Executed in this worktree after installing dependencies:

- `pnpm --filter @drts/contracts build` — PASS
- `pnpm --filter @drts/api exec vitest run tests/unit/forwarder.service.test.ts tests/unit/forwarder.controller.test.ts` — PASS (`2` files, `37` tests)
- `pnpm exec vitest run tests/unit/forwarder.test.ts` — PASS (`1` file, `4` tests)
- `pnpm --filter @drts/api typecheck` — PASS

These commands validate the repo-local proof packet against current `HEAD`.
