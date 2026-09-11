# SR-QA-DRIVER-001 — 司機開通／設備／班次／行程／收益驗收

- Task: `SR-QA-DRIVER-001`
- Owner: `Claude2`
- Reviewer: `Claude`
- Base SHA: `3be0530b9175c9fff3abdd8b3b8dbdf77cb7b9c1` (per task brief `next` field)
- Branch base at handoff time: fast-forwarded `claude2/sr-qa-driver-001` onto
  `origin/dev` before writing/running anything, since the branch was 1 commit
  behind and could fast-forward cleanly (`git merge --ff-only origin/dev`).
- Candidate SHA: recorded at handoff via `CANDIDATE_SHA=$(git rev-parse HEAD)`
  (see task-board handoff note for the exact value).
- Capabilities: C049, C050, C051, C053, C054, C055, C056, C057, C058, C060,
  C061, C062 (from `docs/04-uat/system-remediation-20260906/source/capabilities.json`).
- Planning ref: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- Execution ref: `docs/03-runbooks/system-remediation-execution-tasks-20260906.md`

## 1. What this task did

This is a verification-only task: no `apps/api` business code was modified.
Two test files already existed untracked in the assigned worktree from a
prior session (`device-session-binding.test.ts`, `dispatch-trip-lifecycle.test.ts`)
covering C050/C053/C054/C055; this task (a) fixed 2 of those tests that had
gone stale against a real auth-gap fix merged to `dev` since they were
written, (b) added 5 new test files covering the remaining capabilities by
either exercising already-implemented functionality with real
write+read-back, or documenting confirmed CURRENT-BEHAVIOUR findings where
the underlying capability turned out not to be implemented as the
capabilities.json gap description implies, and (c) filed those findings as a
sourced follow-up task, `SR-DRIVER-GAPS-20260911` (owner `Codex`, reviewer
`Claude`, `backlog`), rather than fixing product code inside this
verification-only task.

## 2. Regression fix: C050 device-session-binding.test.ts vs. a real auth-gap fix

At this task's base/candidate SHA, `DriverDeviceSessionService.revoke()`
(`apps/api/src/modules/auth/driver-device-session.service.ts:547-620`) now
requires a caller `identity` and calls
`assertIdentityCanRevokeBinding(binding, identity)`
(`driver-device-session.service.ts:1001-1062`), which throws
`DRIVER_DEVICE_BINDING_FORBIDDEN` (403) if no identity is supplied, or if a
`driver`-realm identity does not match the binding's own `driverId`. The
pre-existing uncommitted test called `revoke({ bindingId })` with no
identity and asserted success, and a separate test destructured
`regulatoryService` out of `setupServices()` without that helper returning
it — both are stale against the current SHA, not real regressions in this
task's own work. Fixed by:

- Passing a real `driver`-realm `BootstrapRequestIdentity` (matching the
  bound driver, with `driver:write` scope) to `revoke()` in the existing
  success-path test.
- Adding two new negative cases: revoke with no identity at all, and revoke
  from a *different* driver's identity — both now correctly rejected with
  `DRIVER_DEVICE_BINDING_FORBIDDEN`, and the binding is confirmed to remain
  active afterward (read-back, not just the rejected call).
- Making `setupServices()` return `regulatoryService` so the pre-existing
  suspended-driver-registration test (which needs it) actually runs instead
  of throwing `TypeError: Cannot read properties of undefined`.

Before: `1 failed | 1 passed` files, `2 failed | 13 passed` tests. After:
`2 passed` files, `17 passed` tests (7 + 10). See §4 for the exact command.

## 3. Coverage by capability

| ID | What was done | Evidence |
| --- | --- | --- |
| C049 | 已有覆蓋（`tests/unit/supply-submission.test.ts`, `apps/api/tests/unit/supply-review.service.test.ts`, `apps/api/tests/integration/int-sup-001-approve-submission-provisions-registry.test.ts` — draft CRUD, duplicate-identity rejection, self-approval block, revision-conflict negative, and 身份／駕駛資格一致 via canonical driver/vehicle/contract/policy provisioning into `RegulatoryRegistryService` on approval). Added: `requestRevision`'s actual SUCCESS path (退件) with real write+read-back through `getSubmission`, plus a stale-revision-replay negative case — neither existed before. | `supply-onboarding-revision.test.ts` (2 tests) |
| C050 | 已有覆蓋 + 修復（see §2）. Added negative cases for the revoke-identity auth gate. | `device-session-binding.test.ts` (7 tests) |
| C051 | 已有覆蓋（`tests/unit/shift-attendance.test.ts` — clock-in/out, double-clock-in, attendance, abandon, and vehicle-dispatchability gating). **Confirmed CURRENT-BEHAVIOUR FINDING**: `ShiftAttendanceService.clockIn()` never checks driver suspension/lifecycle status (only vehicle dispatchability) — a suspended driver can clock in, with or without an eligible vehicle. Filed as part of `SR-DRIVER-GAPS-20260911`. | `shift-clockin-suspension-gap.test.ts` (2 tests) |
| C053/C054/C055 | 已有覆蓋（`apps/api/tests/unit/owned-mobility.service.test.ts`, ~7300 lines) + fixed/verified via the pre-existing `dispatch-trip-lifecycle.test.ts` in this task (accept/reject/timeout, depart→arrive→start→complete, illegal transitions, idempotent re-press, `MIN_PHOTO_COUNT_NOT_MET` gate, malformed-proof rejection). | `dispatch-trip-lifecycle.test.ts` (10 tests) |
| C056 | 已有覆蓋（`apps/api/tests/integration/int-mob-001-batch-heartbeat-idempotency.test.ts` — dedupe, newest-current-location-wins over out-of-order replay, stale-tracking-status, restart reconstruction; `apps/api/tests/unit/driver-heartbeat.http.test.ts`; `tests/security/iam-driver-authz-enforcement.test.ts`; `tests/e2e/E2E-021-driver-heartbeat-replay.sh`). No new test added — 已有功能先驗而非重寫, and this task's own reading of `recordBatchHeartbeatItem`/`applyLatestDriverLocation` (regulatory-registry.service.ts:1177-1234, 2986-2996) confirms the out-of-order-rejection and dedup logic those tests exercise. | (cited, no new file) |
| C057 | **Positive regression added**: `PlatformEarningsController.resolveDriverId` (platform-earnings.controller.ts:22-58) is a correctly implemented 本人限定存取 gate — verified directly (a driver reading their own summary/by-platform succeeds; requesting another driver's earnings gets `DRIVER_IDENTITY_MISMATCH`; unauthenticated gets `AUTH_REQUIRED`). No prior test in the repo covered this controller method. | `driver-earnings-statement-access.test.ts` (3 tests) |
| C058 | **Confirmed CURRENT-BEHAVIOUR FINDING**: `BillingSettlementController`'s `driver-statements*` routes have no `@RequireRealms` of their own, so `auth.policy.ts`'s path-based default (`platform`, `ops` only — NOT `driver`) applies; drivers cannot reach these routes at all today. Separately, `BillingSettlementService.getDriverStatement`/`listDriverStatements` take no identity/ownership parameter and perform no per-driver filtering at the service layer either (unlike every other driver-facing service touched in this task). `DriverStatementRecord` also has no downloadable-artifact field (no bytes/PDF/signed-URL) at all. Filed as part of `SR-DRIVER-GAPS-20260911`. | `driver-earnings-statement-access.test.ts` (2 tests) |
| C060 | 已有覆蓋（`tests/unit/driver-settings.test.ts` — defaults, updates, cross-call persistence, partial updates, listAll; `tests/security/iam-route-driver-negative.test.ts` / `iam-driver-authz-enforcement.test.ts` — per-driver ownership on get/update). **Confirmed CURRENT-BEHAVIOUR FINDING**: `notificationsEnabled` is read nowhere outside `driver-settings.service.ts` itself — `AuditNotificationService.recordNotification` (the exact call site `generateDriverStatements` uses) records a notification for an opted-out driver with zero suppression. Filed as part of `SR-DRIVER-GAPS-20260911`. | `driver-settings-notification-effect.test.ts` (1 test) |
| C061 | **Positive regression added** for the adjacent, correctly-implemented VEHICLE-side mechanism: `listExpiringPolicies(windowDays)` real date-window query, and expiring a vehicle's own seeded active policy past its `endAt` via `activateInsurancePolicy` really flips `vehicle.insuranceStatus` to `expired` and `dispatchableFlag` to `false` (read back independently from the vehicle record). **Confirmed CURRENT-BEHAVIOUR FINDING**: the DRIVER-license half of this capability has no equivalent — `DriverRegistryRecord` has no expiry-date field of any kind, `licensesValid` is a static manually-set boolean, so there is no date model to drive a T-30/T-7 reminder or an automatic dispatch ban for driver-license expiry. Filed as part of `SR-DRIVER-GAPS-20260911`. | `driver-license-expiry-gap.test.ts` (3 tests) |
| C062 | 已由另一任務完整關閉：`SR-DRIVER-WEB-ACCEPTANCE-RUNNER-20260911`（`docs/04-uat/system-remediation-20260906/driver-web-acceptance-runner.md`）— real hosted GitHub Actions run `34570415756` (SHA `fe40644f6`), both jobs (`web-export-and-browser-acceptance`, `native-export-acceptance`) `success`; real `expo export -p web`, served + browsed with Chromium (3/3 routes passed), plus a native-import-boundary grep gate. No new work needed here (已有功能先驗而非重寫); this task does not touch `apps/driver-app/`. | (cited, no new file — see that doc) |

## 4. Commands actually run and their results

```
$ pnpm exec vitest run tests/unit/system-remediation/sr-qa-driver-001/
 Test Files  7 passed (7)
      Tests  30 passed (30)
```

Per-file breakdown (all passed):

- `device-session-binding.test.ts` — 7 tests
- `dispatch-trip-lifecycle.test.ts` — 10 tests
- `supply-onboarding-revision.test.ts` — 2 tests
- `shift-clockin-suspension-gap.test.ts` — 2 tests
- `driver-earnings-statement-access.test.ts` — 5 tests
- `driver-settings-notification-effect.test.ts` — 1 test
- `driver-license-expiry-gap.test.ts` — 3 tests

```
$ git diff --check
(exit 0, no output)
```

`pnpm exec tsc -p tsconfig.json --noEmit` was run from `apps/api`. It reports
a large pre-existing, unrelated set of failures already present on `dev`
before this task (missing `@drts/contracts` exports referenced by
`owned-mobility`/`voice-booking`/`contract-operational-view`, e.g.
`BookingRequirements`, `TenantBookingListQuery`,
`ContractOperationalViewRecord`) — none of them reference any file this task
touched (`driver-device-session.service.ts`, `shift-attendance/*`,
`billing-settlement/*`, `driver-settings/*`, `regulatory-registry/*`, or any
file under `tests/unit/system-remediation/sr-qa-driver-001/`). Zero new
`tsc` errors from this task's changes.

`pnpm exec playwright test -c playwright.system-remediation.config.ts
sr-qa-driver-001` from the task brief's own "檢查指令" was **not run**: this
task's `write_scopes` include a `tests/e2e/system-remediation/sr-qa-driver-001/`
artifact path, but no e2e spec was added there. This VM's tooling
additionally does not permit starting product dev/preview/browser servers
(see the environment restriction note in this task's dispatch), so a real
Playwright browser run against a live app was not possible from here in any
case. This is recorded explicitly as **not done**, not silently skipped.

## 5. Resource IDs referenced by the new/fixed tests (real service state, not fixtures)

- Driver device bindings: freshly issued per test via
  `issueRegistrationInvitation`/`register` against `drv-demo-001` (device
  ids `qa-device-001`..`qa-device-006`) — real `bindingId`s asserted
  active/inactive through `isBindingActive` reads.
- Supply submission: seed id `sub_u51` (`fleet-demo-003`,
  `vehicle_onboarding`, was `in_review` rev 1) — moved to `needs_revision`
  rev 2 by `requestRevision`, read back via `getSubmission`.
- Shift/driver: `drv-demo-003`, `drv-demo-004` (seeded in
  `RegulatoryRegistryService`) — suspended via `updateDriverLifecycle`, then
  real shift ids from `ShiftAttendanceService.clockIn`.
- Earnings: `drv-demo-001` via `PlatformEarningsService` real
  summary/by-platform computation; mismatch case requests `drv-demo-002`'s
  data as `drv-demo-001` and is rejected.
- Driver statements: generated via `BillingSettlementService
  .generateDriverStatements({ periodMonth: "2026-03" })` against real seed
  trips → real `statement-<uuid>` ids for `drv-demo-001`, read back via
  `getDriverStatement`/`listDriverStatements`.
- Driver settings: `drv-demo-notif-001` (fresh id, default-then-updated
  settings).
- Insurance/vehicle: `veh-demo-001` with its seeded policy `policy-demo-001`
  — expired past its real `endAt` via `activateInsurancePolicy`, read back
  via `listVehicles()`.

## 6. Explicitly NOT done (no live/real-device claim made)

- Real device upload for onboarding documents (C049), real single-device
  enforcement / push-revocation / offline-resume on a physical handset
  (C050), real backgrounded native accept and native push delivery
  (C053-055), real Android/iOS GPS/permission/kill/forced-reconnect behaviour
  (C056), real bank/channel statement download and real device settings
  persistence across an actual OS restart (C058/C060), and real device
  expiry-notification delivery (C061) are all out of scope for this VM — see
  `SR-LIVE-DRIVER-001` (not this task) for native/physical-device
  acceptance.
- This task did not implement any product-code fix for the 4 confirmed
  CURRENT-BEHAVIOUR findings (C051 suspension gap, C057/C058 statement
  ownership + missing download artifact, C060 dead notification
  preference, C061 missing driver-license expiry model). They are filed as
  `SR-DRIVER-GAPS-20260911` (owner `Codex`, reviewer `Claude`, `backlog`)
  with citations back to the exact test files/line-level evidence above.

## 7. Handoff

Owner does not self-`done`. Handed off to reviewer `Claude` via
`ai-status.sh handoff` after committing and a normal (non-force) push of
`claude2/sr-qa-driver-001`. `done` requires independent review + this
candidate's CI/merge + `required_acceptance` evidence per the candidate
lifecycle, none of which this task performs itself.
