# EXT-002 — Real Forwarder Adapter Proof Gate

**Task:** `EXT-002`  
**Owner:** Gemini2  
**Reviewer:** Codex  
**Status:** reviewer-corrected gate packet  
**Created:** 2026-05-01

## Purpose

This packet prevents the Grab Taiwan / forwarder adapter from being treated as production-ready
while the repo still only has a stubbed adapter and graceful-skip E2E scaffold. The repo can prove
route-locking, no-owned-assignment semantics, and reconciliation surfaces. It cannot claim a live
forwarder launch until the external platform contract, credentials, webhook signature, callbacks,
status sync, and lost-race evidence exist.

## Current Repo Baseline

| Evidence family | Current anchor                                                                      | Gate read      |
| --------------- | ----------------------------------------------------------------------------------- | -------------- |
| Workflow gate   | `docs/03-runbooks/phase1-workflow-acceptance-release-gates.md` `WF-FWD-001`         | external-gated |
| Gap matrix      | `docs/03-runbooks/cross-repo-gap-matrix-20260424.md` external-gated Grab Taiwan row | external-gated |
| E2E scaffold    | `tests/e2e/E2E-002-forwarded-order.sh`                                              | graceful-skip  |
| Adapter seam    | `apps/api/src/modules/forwarder/grab-taiwan.adapter.ts`                             | stub only      |
| Domain service  | `apps/api/src/modules/forwarder/forwarder.service.ts`                               | repo/static    |

`tests/e2e/E2E-002-forwarded-order.sh` exits successfully when no forwarded task is seeded, but that
success is only a graceful skip. It is not live adapter proof.

## External Blocker Records

| Blocker ID        | Missing input                                      | Required evidence                                                                        | Owner to confirm            | Release effect                       |
| ----------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------ |
| `EXT-002-BLK-001` | Forwarder API contract authority                   | Approved endpoint, payload, status-code, idempotency, cancellation, and callback schema. | Forwarder integration PM    | No production adapter activation.    |
| `EXT-002-BLK-002` | Sandbox credentials and network access             | Sandbox client id/secret, signing secret, webhook endpoint allowlist, and secret path.   | Forwarder technical owner   | No live sandbox E2E proof.           |
| `EXT-002-BLK-003` | Webhook signature and replay-protection algorithm  | Signature header names, canonical payload, timestamp window, replay nonce/idempotency.   | Forwarder security owner    | Webhooks remain stub/scaffold only.  |
| `EXT-002-BLK-004` | Forwarded task seed or live inbound order          | At least one route-locked external task visible to driver app in staging.                | Forwarder QA owner          | E2E-002 remains graceful-skip only.  |
| `EXT-002-BLK-005` | Callback lifecycle evidence                        | Accept, reject, cancel, complete, and status-sync callback logs with correlation IDs.    | Forwarder QA + DRTS ops     | No lifecycle pass claim.             |
| `EXT-002-BLK-006` | Lost-race and duplicate callback evidence          | Out-of-order, duplicate, stale, and simultaneous accept/cancel cases are preserved.      | DRTS backend + forwarder QA | Race handling remains repo-static.   |
| `EXT-002-BLK-007` | No-owned-assignment proof with live forwarded task | E2E evidence that forwarded tasks never create owned `dispatch_assignment` rows.         | DRTS QA                     | Cannot claim `WF-FWD-001` live pass. |

## Proof Requirements

| Requirement                | Evidence format                                                              |
| -------------------------- | ---------------------------------------------------------------------------- |
| credential proof           | Redacted secret path, sandbox tenant/platform id, credential owner, expiry.  |
| webhook signature proof    | Signed callback sample, replay-denial sample, timestamp-window result.       |
| callback proof             | Logs for inbound order, accept confirm, cancel, complete, sync failure.      |
| status sync proof          | Before/after forwarded order snapshots with external status and DRTS mirror. |
| lost-race proof            | Audit/trace showing stale callback ignored without overwriting newer state.  |
| E2E-002 no-overclaim proof | Script output that distinguishes graceful skip from live pass.               |

## E2E-002 Language

Allowed:

- "E2E-002 gracefully skipped because no forwarded task seed/live adapter was present."
- "E2E-002 passed with live forwarded task evidence attached."

Not allowed:

- "Forwarded order integration passed" when the script only skipped.
- "Grab Taiwan adapter is ready" while `EXT-002-BLK-*` inputs remain open.
- "Stub adapter success equals partner callback confirmation."

## Reviewer Code Decision

No runtime code change is accepted for `EXT-002` unless it is backed by a failing test or concrete
external evidence. The attempted axios-style placeholder adapter was rejected because it introduced
fake credentials, fake API URL assumptions, and no signature/callback proof. The correct current
state is to keep the adapter visibly stubbed and keep live activation `EXTERNAL-GATED`.

## Acceptance Mapping

| Acceptance item                             | Evidence                                                           |
| ------------------------------------------- | ------------------------------------------------------------------ |
| real adapter proof requirements named       | External blocker records and proof requirements above.             |
| E2E-002 graceful skip not overclaimed       | E2E-002 language and workflow gate wording.                        |
| missing platform inputs become blockers     | `EXT-002-BLK-001` to `EXT-002-BLK-007`.                            |
| repo bug fixed only if evidence exposes one | No runtime code fix accepted; no evidence-backed bug was produced. |
