# Round 7 — Completion Proof + Offline Replay

## Plan

- Functional: the trip `complete` action must enforce proof requirements, succeed
  with proof, and be idempotent on replay (weak-network retry with the same
  request id must not create a duplicate completion).
- Display: the Trip workspace exposes 完成行程 gated by "完單前需先載入訂單佐證需求"
  (captured in Round 3).
- Automated: the offline-cache/replay logic is unit-tested.

## Execution (task `2b98fc7a…`, on_trip)

| Step                      | Request                                                                           |    HTTP | Result                                    |
| ------------------------- | --------------------------------------------------------------------------------- | ------: | ----------------------------------------- |
| 1. complete WITHOUT proof | `POST …/complete` (no `proof`)                                                    | **409** | `MIN_PHOTO_COUNT_NOT_MET`                 |
| 2. complete WITH proof    | `…/complete` `{proof:{photos,signatureId}}`, `Idempotency-Key:R7K1`               | **201** | status → `completed`                      |
| 3. idempotent replay      | same body + same `Idempotency-Key:R7K1`                                           | **201** | still `completed`, no error, no duplicate |
| 4. unit tests             | `vitest completion-proof pending-completion-replay use-pending-completion-replay` |       — | **14 passed / 3 files**                   |

## Results — PASS

| Check                        | Expected                         | Observed                                 | Verdict |
| ---------------------------- | -------------------------------- | ---------------------------------------- | ------- |
| Proof gate                   | reject completion without photos | 409 MIN_PHOTO_COUNT_NOT_MET              | PASS    |
| Completion with proof        | success, status completed        | 201, completed                           | PASS    |
| Idempotent replay            | same request id → no duplicate   | 201, still completed (single completion) | PASS    |
| Offline cache + replay logic | unit-covered                     | 14/14 unit tests pass                    | PASS    |
| Display (proof gating)       | 完成行程 + proof hint            | verified in Round 3 (行程作業台)         | PASS    |

## Defects / Findings

None. The proof requirement is enforced server-side (MIN_PHOTO_COUNT_NOT_MET),
completion succeeds with proof, and replay is idempotent — matching the app's
offline pending-completion-replay design (`lib/pending-completion-replay.ts`,
`lib/use-pending-completion-replay.ts`).

## Test-case impact

Already covered: driver-app unit tests (completion-proof / pending-completion-replay
/ use-pending-completion-replay, 14 tests) + `E2E-001` LEG 3.6 (complete with
proof fixture). No new automated case required.
