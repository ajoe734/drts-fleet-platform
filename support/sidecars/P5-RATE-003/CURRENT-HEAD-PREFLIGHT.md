# P5-RATE-003 Current-Head Preflight

**Task:** `P5-RATE-003`
**UI dependency:** backend acceptance for `P5-RATE-UI-001`
**Authoritative head:** `8f0a8cf3bfcfb11a6afece2ccf28bf592d56941f`
**Continuation baseline:** `2541408114deda0a2228a5e75b0b984554fd083e`
**Requirement:** `08_multi_taxi_operations_ui_design_requirements_20260723.md`
v1.2 and `10_full_17_screen_fleets_execution_tasks_20260724.md` sections 6/11
**Scope:** rating backend/read contracts, rating-local API adapter, and auth
capability wiring only; no Platform Admin shell, navigation, shared
translation, canonical design, or specification edits

## Current-Head Classification

| Acceptance item                                        | Status            | Current-head evidence / action                                                  |
| ------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------------- |
| Passenger submits one rating after trip completion     | `verified`        | `MultiTaxiService.submitPassengerRating` and existing unit tests                |
| Canonical rating statuses include invalidated          | `implemented`     | `PassengerTripRatingRecord.status` and `ops.passenger_trip_ratings` constraint  |
| Driver aggregate stores state, average, count, version | `implemented`     | `DriverRatingSummary` and `ops.driver_rating_summaries`                         |
| Invalidate command authority                           | `implemented`     | Canonical POST delegates to service/repository authority                        |
| Required invalidation reason                           | `implemented`     | Command validation rejects blank or oversized reason                            |
| Resource-bound confirmation                            | `implemented`     | Confirmation action and rating ID must match the request path                   |
| Idempotent invalidation                                | `implemented`     | Rating-bound idempotency key and replay receipt                                 |
| Atomic moderation audit                                | `implemented`     | `ops.passenger_rating_moderation_audits` in the mutation transaction            |
| Aggregate rebuild after invalidation                   | `implemented`     | Active-only aggregate rebuild in the same transaction                           |
| Read/mutation capability and 403 denial                | `implemented`     | Separate `multi_taxi_ratings:read` and `:moderate` guards                       |
| Direct score/count/average editing prohibited          | `verified`        | No direct mutation contract or endpoint exists                                  |
| Restore command                                        | `blocked_command` | Explicitly remains command-pending                                              |
| Rating governance UI                                   | `implemented`     | Rating-owned routes are in baseline `254140811`; shared shell remains untouched |
| Rating review list GET                                 | `implemented`     | Repository-backed filters and pagination; no passenger subject or full comment  |
| Rating review detail GET                               | `implemented`     | Masked subject, audit history, aggregate, and server-owned actions              |
| Driver rating authority GET                            | `implemented`     | Persisted `rated`/`new_driver`/`unavailable`; missing/inconsistent fails closed |

## Implementation Decision

This branch adds one server-owned invalidation command. The command requires a
non-empty reason, an explicit confirmation bound to the path rating ID, and an
idempotency key. The repository performs rating mutation, aggregate rebuild,
and immutable moderation-audit insertion in one database transaction.

The response omits `passengerSubjectRef`. No restore, direct score edit, direct
average edit, direct count edit, or client-owned aggregate command is added.

## Canonical GET Closeout

| Method | Route                                                         | Capability                |
| ------ | ------------------------------------------------------------- | ------------------------- |
| `GET`  | `/api/platform-admin/multi-taxi-ratings`                      | `multi_taxi_ratings:read` |
| `GET`  | `/api/platform-admin/multi-taxi-ratings/:ratingId`            | `multi_taxi_ratings:read` |
| `GET`  | `/api/platform-admin/multi-taxi-rating-authorities/:driverId` | `multi_taxi_ratings:read` |

Persistent mode reads only `ops.passenger_trip_ratings`,
`ops.driver_rating_summaries`, `ops.passenger_rating_moderation_audits`, and
the existing order/driver snapshots used for display labels. Missing or
inconsistent aggregate authority returns 404/503; it never falls back to
in-memory state or fabricates an average, count, or `new_driver` state.

List filters are normalized server-side for status, score, tag, driver,
trip/order, Taipei calendar date, and bounded pagination. Detail masking uses
the server sensitive-data policy. Mutation availability is derived from the
authenticated actor's moderation capability.

## Verification Plan

1. Repository tests for canonical list/detail/authority SQL and sensitive-field
   omission.
2. Service tests for filters, masking, action capability, history, and
   missing/inconsistent authority fail-closed behavior.
3. Controller/auth tests for envelopes, separate read/moderate capabilities,
   and 403 denial.
4. Integration/contract tests from repository through controller into the
   production Platform Admin parser.
5. Contracts build, API regression/typecheck/lint, and rating-local UI tests.

## Branch Verification

| Check                                             | Result                                                |
| ------------------------------------------------- | ----------------------------------------------------- |
| Targeted API unit/integration/contract suites     | `119 passed` across 6 files                           |
| Full `@drts/api` regression suite                 | `891 passed` across 130 files                         |
| Rating-local UI contract tests                    | `16 passed` across 2 files                            |
| Control-plane auth helper tests                   | `3 passed`                                            |
| Contracts build, API and Platform Admin typecheck | `passed`                                              |
| API source lint and changed-test lint             | `passed`                                              |
| Restore command                                   | `blocked_command` and not implemented                 |
| Shared nav/shell/global translations              | not touched                                           |
| Migration deployment                              | not performed; this branch does not deploy or publish |
