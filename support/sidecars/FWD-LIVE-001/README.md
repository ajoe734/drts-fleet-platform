# FWD-LIVE-001

Status: `partial evidence only`

This directory does not yet contain the 11 directive-`§D` sandbox proof items
required to move `WF-FWD-001` from `EXTERNAL-GATED` to
`PASS (sandbox evidence)`.

Current classification:

- platform target: Grab Taiwan real forwarder adapter
- evidence classification: `external-gated partial evidence`
- non-claim: repo-local `forwarder_sandbox` proof is not partner sandbox proof

## Contents

- `FWD-LIVE-001-EVIDENCE-PACK.md`
  - dated probe snapshots from `2026-05-19` and `2026-05-22`
  - current staging reachability and auth boundary evidence
  - blocker mapping for `EXT-002-BLK-001` through `EXT-002-BLK-007`

## Directive §D proof matrix

| Required proof item | Current state | Evidence / note |
| --- | --- | --- |
| Platform name + classification | partial | Grab Taiwan real adapter remains `EXTERNAL-GATED`; shipped repo adapter is still stub-only. |
| Masked credential ref | missing | No redacted sandbox credential path or secret-version reference was surfaced from this workspace. |
| Inbound order sample | missing | No real sandbox inbound order could be collected because the documented staging endpoints were unreachable. |
| Accept sample | missing | No real sandbox accept relay / confirmation evidence was collected. |
| Lost-race sample | missing | No real sandbox lost-race callback or trace evidence was collected. |
| Cancel sample | missing | No real sandbox cancellation callback evidence was collected. |
| Complete sample | missing | No real sandbox completion callback evidence was collected. |
| Settlement sample | missing | No real sandbox settlement file, statement row, or platform earnings sample was collected. |
| No-owned-assignment proof | missing | No real sandbox forwarded-task flow was reachable to prove the absence of owned `dispatch_assignment` rows. |
| Replay / idempotency proof | missing | Repo-local idempotency coverage exists in code/tests, but no real sandbox duplicate-delivery or replay-denial evidence was collected. |
| Signature proof | missing | No signed webhook sample, header contract, or verification trace was accessible from this workspace. |

## Current blockers

- `EXT-002-BLK-001`: approved forwarder API contract authority
- `EXT-002-BLK-002`: sandbox credentials plus a reachable endpoint
- `EXT-002-BLK-003`: webhook signature and replay-protection details
- `EXT-002-BLK-004`: at least one seeded forwarded-task flow
- `EXT-002-BLK-005`: callback lifecycle samples with correlation IDs
- `EXT-002-BLK-006`: duplicate / stale / lost-race callback evidence
- `EXT-002-BLK-007`: no-owned-assignment proof on a live forwarded task

## Current probe result

Latest revalidation in this workspace was at `2026-05-22T10:20Z`:

- active `gcloud` account: `bobo.du@cctech-support.com`
- active `gcloud` project: `drts-dev-bobo-20260503`
- `gcloud auth print-identity-token`: failed, non-interactive reauthentication required
- `gcloud run services list` / `gcloud secrets list`: failed behind the same reauthentication boundary
- `https://drts-api-kdhu6wzufa-uc.a.run.app/`, `/health`, `/api/health`: HTTP `404`
- `api-staging.drts.internal`: `NXDOMAIN`

Until those external inputs arrive, this sidecar must remain a partial packet
and must not claim sandbox closure.
