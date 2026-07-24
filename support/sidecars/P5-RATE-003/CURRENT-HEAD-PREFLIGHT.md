# P5-RATE-003 Current-Head Preflight

**Task:** `P5-RATE-003`
**UI dependency:** backend acceptance for `P5-RATE-UI-001`
**Authoritative head:** `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`
**Requirement:** `08_multi_taxi_operations_ui_design_requirements_20260723.md`
v1.2 and `10_full_17_screen_fleets_execution_tasks_20260724.md` sections 6/11
**Scope:** backend only; no Platform Admin shell, navigation, shared translation,
rating UI, canonical design, or specification edits

## Current-Head Classification

| Acceptance item                                        | Status            | Current-head evidence / action                                                 |
| ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------ |
| Passenger submits one rating after trip completion     | `verified`        | `MultiTaxiService.submitPassengerRating` and existing unit tests               |
| Canonical rating statuses include invalidated          | `implemented`     | `PassengerTripRatingRecord.status` and `ops.passenger_trip_ratings` constraint |
| Driver aggregate stores state, average, count, version | `implemented`     | `DriverRatingSummary` and `ops.driver_rating_summaries`                        |
| Invalidate command authority                           | `missing`         | No controller/service/repository command on current head                       |
| Required invalidation reason                           | `missing`         | No moderation command contract                                                 |
| Resource-bound confirmation                            | `missing`         | No moderation command contract                                                 |
| Idempotent invalidation                                | `missing`         | No moderation command receipt or unique key                                    |
| Atomic moderation audit                                | `missing`         | No rating moderation audit persistence                                         |
| Aggregate rebuild after invalidation                   | `partial`         | Rebuild exists after rating creation only                                      |
| Mutation capability and 403 denial                     | `missing`         | No rating moderation scope or protected command route                          |
| Direct score/count/average editing prohibited          | `verified`        | No direct mutation contract or endpoint exists                                 |
| Restore command                                        | `blocked_command` | Explicitly remains command-pending                                             |
| Rating governance UI                                   | `blocked_command` | Deferred until Fleet B shared-shell merge; excluded from this backend branch   |

## Implementation Decision

This branch adds one server-owned invalidation command. The command requires a
non-empty reason, an explicit confirmation bound to the path rating ID, and an
idempotency key. The repository performs rating mutation, aggregate rebuild,
and immutable moderation-audit insertion in one database transaction.

The response omits `passengerSubjectRef`. No restore, direct score edit, direct
average edit, direct count edit, or client-owned aggregate command is added.

## Planned Verification

1. Service tests for required reason, confirmation, idempotent replay, payload
   conflict, missing rating, already-invalidated rating, and aggregate result.
2. Repository tests for transactional status update, active-only aggregate
   rebuild, audit insert, rollback, and replay without a second mutation.
3. Controller/auth tests for actor propagation, required capability, 403
   without capability, and success with capability.
4. Contracts build, API typecheck, lint, and targeted Vitest suites.

## Branch Verification

| Check                                            | Result                                                |
| ------------------------------------------------ | ----------------------------------------------------- |
| Targeted rating/controller/repository/auth tests | `101 passed`                                          |
| Full `@drts/api` regression suite                | `873 passed` across 128 files                         |
| Contracts build and API typecheck                | `passed`                                              |
| API source lint and changed-test lint            | `passed`                                              |
| Restore command                                  | `blocked_command` and not implemented                 |
| Platform Admin UI/shared shell                   | not touched                                           |
| Migration deployment                             | not performed; this branch does not deploy or publish |
