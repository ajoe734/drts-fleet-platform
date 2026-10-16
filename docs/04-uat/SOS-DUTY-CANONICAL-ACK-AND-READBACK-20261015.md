# SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015

Owner Claude2; reviewer Gemini2. Scope is C047 / S-3 §§23-25 canonical SOS
duty acknowledgment (first-writer-wins), the Ops/Incident handover, and
honest cross-app current-state readback. Does not touch suppression TTL,
generic financial/geographic policy, SDK/global auth policy, or any
Demo-owned function. `task_spec_ref`:
`.local/goal-continuation-20261015T1628-original-passenger-dispatch-call-root/SOS-DUTY-CANONICAL-ACK-AND-READBACK-20261015-R1.task-spec.json`.

## Original findings and before-fix proof

- `DriverSosService` had no acknowledgment method at all: `DriverSosEventRecord.dutyAcknowledgement`
  (`apps/api/src/modules/driver-sos/driver-sos.service.ts`) was written once at
  submission time (`acknowledgedAt: null, acknowledgedByActorId: null`) and
  never updated by any caller. S-3 §24.2 `SosDutyAcknowledgement` existed in
  `@drts/contracts` (`packages/contracts/src/phase1-p5-s3-multi-taxi.ts:1297`)
  but was unreferenced anywhere in the codebase.
- Both Ops SOS callers (`apps/ops-console-web/app/sos/page.tsx`,
  `apps/ops-console-web/app/sos/[incidentId]/page.tsx`) acknowledged duty by
  calling the generic `PATCH /api/incidents/:id { assignedTo }` directly.
  Neither page ever read or referenced `sosEventId`; the SOS canonical model
  was entirely bypassed and `DriverSosEvent.dutyAcknowledgement` never moved
  off `null`, matching acceptance item 2's "not merely a local
  Incident.assignedTo projection" framing.
- `apps/driver-app/lib/driver-sos-outbox.ts`'s `markDriverSosCaseSubmitted`
  wrote the timeline detail `事件編號 ${eventNo} 已建立並指派值班人員（事件編號：${incidentId}）` at
  submission time, i.e. while `result.event.dutyAcknowledgement.acknowledgedByActorId`
  is still `null`. This is the literal premature "duty already assigned"
  claim named in the task brief; the native timeline asserted a duty person
  had been assigned when none had.
- `DriverSosUrgentAlertOutboxRecord.status` never left `"pending"` after
  creation; no caller transitioned it toward `"delivered"`.

Reproduction: `apps/driver-app/tests/unit/driver-sos-outbox.test.ts`'s existing
`"records a submitted receipt and incident correlation"` case asserted only
`timeline[1].kind === "fleet_report_confirmed"`, not its text, so the false
claim shipped uninspected; reading `markDriverSosCaseSubmitted`'s source at
`driver-sos-outbox.ts:421` (pre-change) shows the literal string.

## Implementation and scope

Backend (`apps/api/src/modules/driver-sos/`):

- `DriverSosService.acknowledgeDuty(sosEventId, command, identity, requestId)`
  is the new canonical first-writer-wins endpoint. It reuses
  `IncidentService.updateIncident({ assignedTo })` — already synchronous,
  single-arbiter, and already throwing `INCIDENT_ASSIGNMENT_CONFLICT` with the
  real current `assignedTo` — as the sole race arbiter, so the Incident
  handover and the SOS event's own `dutyAcknowledgement` cannot diverge into
  two owners. Same-actor re-acknowledgment is idempotent (no duplicate
  timeline); a losing caller gets a normal 200 response carrying the actual
  current owner (`wonAcknowledgement: false`), not an opaque error. On a real
  first win, `status` moves to `"acknowledged"`, one `duty_acknowledged`
  timeline entry is appended, and the urgent-alert outbox is advanced to
  `"delivered"` (`markOutboxDelivered`) — `DriverSosUrgentAlertOutboxRecord`
  has no `"acknowledged"` member in `@drts/contracts`, so `"delivered"` is the
  outbox-side signal while the event's own `status`/`dutyAcknowledgement`
  carry the acknowledgment.
- `DriverSosService.getEventForOps` / `getOwnEventForDriver` /
  `getEventByIncidentIdForOps` are authoritative readbacks (`{ event,
  timeline }`), scoped to Ops realm or the owning driver respectively. The
  by-incident variant lets Ops consoles — which only hold `incidentId` — reach
  the canonical SOS event.
- `DriverSosVerificationRepository.persistDutyAcknowledgement` persists the
  event status/snapshot, appends the timeline row, and advances the outbox
  row, mirroring the existing `persistAlertObservation` transaction shape.
- New routes: `POST ops/driver-sos/:sosEventId/duty-ack`,
  `GET ops/driver-sos/:sosEventId`, `GET ops/driver-sos/by-incident/:incidentId`,
  `GET driver/sos-events/:sosEventId`. `auth.policy.ts` gets matching entries.
  The driver readback route uses `incident:write`, not `incident:read`: the
  IAM catalogue (`packages/contracts/src/iam-policy-catalog.ts`) grants the
  driver realm no `incident:read` scope at all (only `incident:write`), the
  same reason the pre-existing `listAttachments` GET already used
  `incident:write`. `tests/security/iam-route-inventory.test.ts`'s realm/scope
  catalogue check caught the first (wrong) attempt at `incident:read` and is
  green after the fix.

Ops console (`apps/ops-console-web/app/sos/page.tsx`,
`.../sos/[incidentId]/page.tsx`): `handleAcknowledge` now resolves the
canonical SOS event via `GET /api/ops/driver-sos/by-incident/:incidentId`,
then calls `POST /api/ops/driver-sos/:sosEventId/duty-ack`, and renders the
existing first-writer-wins banner off the response's `wonAcknowledgement` /
`dutyAcknowledgement.acknowledgedByActorId` instead of parsing an
`INCIDENT_ASSIGNMENT_CONFLICT` error body. `sos-view-model.ts` (out of this
task's write scope) is unchanged and continues to work unmodified because
`incident.assignedTo` is still populated via the same `IncidentService`
handover as before.

Driver app (`apps/driver-app/lib/driver-sos-outbox.ts`,
`apps/driver-app/app/sos.tsx`): `DriverSosActiveCase` gains an honest
`dutyAcknowledgement` field, initialized `null`/`null` and only ever set from
a server `event.dutyAcknowledgement` — submission never claims assignment.
The false claim's text is replaced with "已送達車隊安全值班，等待值班人員認領" (delivered,
awaiting duty claim). New `applyDriverSosDutyReadback` applies a server
readback idempotently: it appends exactly one `duty_acknowledged` timeline
entry on the pending→acknowledged transition and is a no-op on repeat
application of the same readback. `sos.tsx` polls
`GET /api/driver/sos-events/:sosEventId` every 20s (stops once acknowledged)
and renders an honest "等待值班認領" / "值班已認領 · {actor}" pill next to the
existing incident pill. All other original SOS flows (atomic submission,
`(driverId, clientEventId)` dedup, offline trigger timestamp, attachment
upload/scan, false-alarm, render-receipt dedup/latency) are untouched.

## Acceptance evidence

- `apps/api`: `npx vitest run tests/unit/system-remediation/sr-qa-call-001/c047-sos-duty-lifecycle.test.ts`
  → 16 passed (10 original + 6 new: first-ack-wins handover, idempotent
  same-actor re-ack, competing-actor loss with real current owner, Ops/driver
  authoritative readback incl. by-incident lookup, non-ops 403, unknown-event
  404).
- `apps/api`: `npx vitest run tests/integration/int-s3-001-driver-sos-idempotency.test.ts
  tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-provider-adapters.test.ts
  tests/unit/driver-sos-attachment.service.test.ts tests/unit/driver-sos-incident.test.ts
  tests/unit/driver-sos-verification.repository.test.ts tests/unit/incident.controller.test.ts
  tests/unit/incident-escalation-service-recovery.test.ts tests/unit/complaint-incident-escalation.test.ts`
  → all passed, no regressions in the preserved atomic/dedup/render/incident
  paths.
- Repo root: `npx vitest run tests/security/iam-route-inventory.test.ts
  tests/security/iam-route-map-negative.test.ts tests/security/iam-driver-authz-enforcement.test.ts`
  → 32 passed; this is the check that caught and forced the
  `incident:write`-not-`incident:read` fix on the driver readback route.
- `apps/api`: `npx tsc -p tsconfig.json --noEmit` — no new diagnostics touch
  `driver-sos/*` or `auth.policy.ts` (pre-existing unrelated failures in
  `tenant-partner`, `voice-booking`, `reporting-filing`, etc. are stale
  `@drts/contracts` dist drift, not from this change).
- `apps/driver-app`: `npx vitest run tests/unit/driver-sos-outbox.test.ts
  tests/unit/driver-sos-end-to-end-platform.test.ts tests/unit/driver-sos-no-os-dialer.test.ts`
  → 14 passed, including 3 new cases (no premature assignment claim at
  submission, one-shot readback timeline application, no-op while still
  pending). Full app suite `npx vitest run` → 545/545 passed (no flake on
  this re-run). `npx tsc --noEmit` — clean.
- `apps/ops-console-web`: `npx tsc --noEmit` clean for both edited pages;
  `npx vitest run tests/unit/sos-view-model.test.ts` → 3 passed (unchanged
  view-model, confirming the pages' display logic needed no changes).

## Round 2: reviewer reopen (2026-10-15T18:14:59Z) findings and fixes

Gemini2 reopened candidate `1ce2ddbcd` with five findings. Each is addressed
below with the real pre-fix code location, the fix, and the regression test
that would have failed against the reopened candidate.

| Finding / acceptance key | Code location | Before → after | Command / result | Not verified |
| --- | --- | --- | --- | --- |
| (1a) `acknowledgeDuty` called `IncidentService.updateIncident` (synchronous, immediately committed) *before* `await persistDutyAcknowledgement`; a DB rejection left the Incident re-assigned while the SOS event still read as unacknowledged. | `driver-sos.service.ts` `acknowledgeDuty` | Reordered: the tentative ack is persisted first; `IncidentService.updateIncident` is only called once `persistDutyAcknowledgement` has settled (success or the thrown error propagates with *no* Incident mutation yet). | `tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts` → "does not leave the Incident falsely assigned when the repository rejects..." — asserts `incident.assignedTo` stays `null` after a simulated repository rejection, then a retry still wins honestly. 5/5 passed. | Real Postgres failure injection (VM has no live DB runtime per dispatch restriction); covered via a mocked `persistDutyAcknowledgement` rejection instead. |
| (1b) Two overlapping `acknowledgeDuty` calls for the same `sosEventId` could both observe `dutyAcknowledgement.acknowledgedByActorId === null` (the first call's mutation only lands after its own `await`), each persisting its own `duty_acknowledged` timeline entry. `persistDutyAcknowledgement`'s `UPDATE` was unconditional, so a true cross-process race would also double-write. | `driver-sos.service.ts` `acknowledgeDuty`; `driver-sos-verification.repository.ts` `persistDutyAcknowledgement` | Added `withAcknowledgeDutyLock`, an in-process async queue keyed by `sosEventId`, so overlapping calls execute strictly sequentially. `persistDutyAcknowledgement`'s `UPDATE` is now conditional on `duty_ack_snapshot->>'acknowledgedByActorId' IS NULL`, returning `{accepted, acknowledgedByActorId, acknowledgedAt}` so even a DB-level loser (cross-process) converges onto the real winner instead of duplicating. | Same test file: "serializes two truly overlapping acknowledgeDuty calls..." (`Promise.all` of two real calls) and "holds a deferred repository write open across a second overlapping call..." (a manually-controlled `Promise` proves the second call never even attempts its own write while the first is in flight: `callCount` stays `1`). Both assert exactly one `duty_acknowledged` timeline entry and a consistent winner/loser. | Multi-process/multi-instance deployment (the conditional `UPDATE` SQL is reviewed but not exercised against a live DB in this VM). |
| (1c) On the "already recorded" (idempotent / losing) path, `dutyAcknowledgement.note` was hardcoded to `null` instead of the actual winning call's note. | `driver-sos.service.ts` `acknowledgeDuty` | New `buildIdempotentAcknowledgement` looks up the stored `duty_acknowledged` timeline entry for the real owner and returns its `payload.note`. | Covered implicitly by the idempotent-path assertions above (`second.dutyAcknowledgement.acknowledgedByActorId`); no case in this candidate generation submits a non-null note on the idempotent path, so the `note` field itself isn't asserted beyond "not crashing" — see gap below. | A dedicated assertion on a non-null note surviving the idempotent path was not added; the existing "idempotent for repeated acknowledgment" case in `c047-sos-duty-lifecycle.test.ts` also does not pass a `note`, so this is reviewed by code inspection of `buildIdempotentAcknowledgement`, not by a failing→passing test. |
| (2a) `recordOpsAlertsRendered` never transitioned `urgentAlertOutbox.status` to `"delivered"` nor `DriverSosEvent.status` from `"submitted"` to `"duty_alerted"` on an actual (non-duplicate) render receipt. | `driver-sos.service.ts` `recordOpsAlertsRendered`; `driver-sos-verification.repository.ts` `persistAlertObservation` | `persistAlertObservation`'s `UPDATE` now also sets `status = 'delivered'` (unless already `'failed'`) and `delivered_at`; it accepts an optional `DriverSosDutyAlertDispatchPlan` and, in the same transaction, conditionally flips `driver_sos_events.status` from `'submitted'` to `'duty_alerted'` (`WHERE status = 'submitted'`) and appends a `duty_alert_dispatched` timeline row. The service only builds that plan when the in-memory event is still `'submitted'`. | New test: "honestly transitions an unacknowledged event to duty_alerted..." — asserts `status === "duty_alerted"`, exactly one `duty_alert_dispatched` timeline entry, no duplicate on a second (duplicate) render, and that `acknowledgeDuty` still proceeds correctly afterward. | — |
| (2b) `getOwnEventForDriver` / `getEventForOps` / `getEventByIncidentIdForOps` returned the SOS event verbatim even when the correlated Incident had independently progressed to `investigating`/`resolved`/`closed`; the SOS event/timeline never caught up. | `driver-sos.service.ts` new `reconcileWithIncident`, wired into all three readback methods; `driver-sos-verification.repository.ts` new `persistStatusTransition` | Each readback now lazily diffs the correlated Incident's status against the SOS event's own forward-progression rank (`submitted < duty_alerted < acknowledged < investigating < resolved < closed`) and, only when the Incident is ahead, persists the catch-up transition plus one timeline entry per crossed step (`investigation_started` / `resolved` / `closed`) — exactly once; a repeat read of the same Incident state is a no-op. | New test: "reconciles investigating/resolved/closed Incident progression onto the SOS event and timeline exactly once per transition" — drives the Incident through all three states via `IncidentService.updateIncident` directly (simulating an Ops action outside the SOS flow) and re-reads twice at the `investigating` step to prove no duplicate timeline entry. | `false_alarm_dismissed` events are explicitly excluded from reconciliation (dismissal is terminal and must not be overwritten by a later Incident status); this exclusion is reviewed by code inspection, not by a dedicated test in this round. |
| (2c) Driver-app `applyDriverSosDutyReadback` only ever compared `dutyAcknowledgement`, ignoring `readback.status`; `sos.tsx`'s polling `useEffect` stopped (`return` with no interval set) as soon as `dutyAlreadyAcknowledged` was true, so native readback could never observe `investigating`/`resolved`/`closed`. | `apps/driver-app/lib/driver-sos-outbox.ts` `applyDriverSosDutyReadback`; `apps/driver-app/app/sos.tsx` polling effect | `DriverSosActiveCase` gains a `status: DriverSosStatus | null` field (set from `result.event.status` at submission, updated by every readback). `applyDriverSosDutyReadback` now also diffs `status` and appends `duty_alert_dispatched` / `investigation_started` / `resolved` / `closed` timeline entries. The polling effect's stop condition changed from `dutyAlreadyAcknowledged` to a new `isDriverSosStatusTerminal(activeCase?.status)` (stops only at `resolved` / `closed` / `false_alarm_dismissed`). | `apps/driver-app`: `pnpm exec tsc --noEmit -p tsconfig.json` clean; `pnpm exec vitest run tests/unit/driver-sos-outbox.test.ts tests/unit/driver-sos-end-to-end-platform.test.ts` → 13/13 passed (pre-existing cases unaffected; no new driver-app-side test was added for the post-acknowledgment polling continuation specifically — see gap). | No RTL/component test exists for `sos.tsx`'s polling `useEffect` itself (same established-convention gap already recorded in round 1); the fix is verified by `tsc` + reading the new `isDriverSosStatusTerminal` gate, and indirectly by the backend-side readback-reconciliation test proving the server now actually reports the later statuses this effect depends on. |

Full re-verification after all round-2 fixes:

- `apps/api`: `pnpm exec tsc --noEmit -p tsconfig.json` → clean (required rebuilding
  stale `@drts/contracts` and `@drts/control-plane-auth` dist first; both are
  pre-existing drift unrelated to this task).
- `apps/api`: `pnpm exec vitest run tests/unit/system-remediation/sr-qa-call-001/c047-sos-duty-lifecycle.test.ts`
  → 16/16 passed (no regression in round-1 cases).
- `apps/api`: `pnpm exec vitest run tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts`
  → 5/5 passed (new round-2 regression coverage).
- `apps/api` sanity (unmodified this round): `pnpm exec vitest run tests/security/iam-driver-authz-enforcement.test.ts tests/unit/iam-policy-catalog.test.ts`
  → 18/18 passed.
- `apps/driver-app`: `pnpm exec tsc --noEmit -p tsconfig.json` → clean;
  `pnpm exec vitest run tests/unit/driver-sos-outbox.test.ts tests/unit/driver-sos-end-to-end-platform.test.ts`
  → 13/13 passed.
- Not re-run this round: `apps/ops-console-web` (unmodified; its callers were
  already wired to the canonical duty-ack endpoint in round 1 and were
  re-confirmed unchanged by `grep`, not re-executed), and the full repo-wide
  test suite (scoped re-verification per the task's write_scopes instead).

## Known gaps / not claimed by this change

- No Next.js component test exists for `app/sos/page.tsx` or
  `app/sos/[incidentId]/page.tsx` in this repository (no established RTL
  convention for these client pages), and this VM may not start a dev/browser
  server per the dispatch's runtime restriction. The Ops console wiring is
  verified by code review plus `tsc`, not by an interactive browser session.
- Real Android/iOS background push delivery and authorized actual duty
  recipients remain original LIVE-DRIVER conditions, not exercised or claimed
  here, per the task's `live_boundary` scope constraint.
- `DriverSosService`'s first-writer-wins arbitration is the existing
  single-Node-process in-memory `IncidentService`, matching this codebase's
  current concurrency bar (the same bar `submitSosEvent`'s dedup and
  `recordOpsAlertsRendered`'s observation dedup already rely on); it is not a
  new cross-process distributed lock.

## Round 3: reviewer reopen (2026-10-15T19:46:55Z) findings and fixes

Gemini2 reopened candidate `afc24da61` with two findings. Both addressed:

| Finding / acceptance key | Code location | Before → after | Command / result |
| --- | --- | --- | --- |
| (1) `sos_exact_candidate_validation` — CI `pnpm run typecheck` TS2322: `actorA.actorId` (`BootstrapRequestIdentity.actorId: string \| null`) passed directly as `acknowledgedByActorId: string` in a test mock's `deferred.resolve(...)`. | `tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts:170` | Already fixed on this branch by a prior commit (`4e974c2e`, `actorA.actorId as string`) before this session started; re-verified it is present and root `pnpm run typecheck` no longer reports this error. | `npx tsc -p tsconfig.json --noEmit` from repo root → no errors referencing this file or any `apps/driver-app`/`apps/api` SOS file. Remaining root typecheck errors (tenant-console-web, bank-console-web, passenger-app-web, `packages/api-client` duplicate-instance `baseUrl` privacy) are pre-existing, outside this task's `write_scopes`, and unmodified by this branch — confirmed via `git status` showing no diff in those paths. |
| (2) `sos_native_honest_pending_ack_and_canonical_readback` — `markDriverSosCaseSubmitted` copied `result.event.dutyAcknowledgement`/`result.event.status` directly onto `nextCase` without going through `applyDriverSosDutyReadback`, so a retry/replay submit that comes back already-acknowledged never appended a `duty_acknowledged` timeline entry (and a later `pollDutyReadback` would see `ackChanged === false` since the ack was already silently absorbed). | `apps/driver-app/lib/driver-sos-outbox.ts` `markDriverSosCaseSubmitted` | `nextCase` is now initialized from `activeCase.dutyAcknowledgement` / `activeCase.status ?? "submitted"` (i.e. carries forward what the case already honestly knew), and at the end of the function `applyDriverSosDutyReadback(nextCase, { status: result.event.status, dutyAcknowledgement: result.event.dutyAcknowledgement })` is applied so any ack/status jump present in the submit response is surfaced through the same honest-timeline path used by polling. | New test in `apps/driver-app/tests/unit/driver-sos-end-to-end-platform.test.ts`: "honestly surfaces duty acknowledgment on a retry/replay submit that returns an already-acknowledged event" — submits with `result.event.status === "acknowledged"` and a populated `dutyAcknowledgement`, asserts the resulting case carries the acknowledgement, `status === "acknowledged"`, and the timeline contains a `duty_acknowledged` entry. Also fixed a pre-existing unrelated test in `driver-sos-outbox.test.ts` ("ensures timeline entries contain clean Chinese strings...") that passed `event: {} as any` — a `{}` event no longer satisfies the new readback call, so the fixture now supplies a minimal real `status`/`dutyAcknowledgement` shape. |

Full re-verification after round-3 fixes:

- `apps/driver-app`: `pnpm --filter driver-app test` → 546/546 passed (up from
  545: the one new regression case). `pnpm --filter driver-app typecheck` →
  clean.
- `apps/ops-console-web`: `pnpm --filter ops-console-web typecheck` → clean.
- Root: `npx vitest run tests/unit/system-remediation/sr-qa-call-001/c047-sos-duty-lifecycle.test.ts tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts` → 21/21 passed (no regression from round 2).
- Root: `npx vitest run tests/security/iam-auth-negative-matrix.test.ts tests/security/iam-driver-authz-enforcement.test.ts tests/security/iam-route-driver-negative.test.ts tests/security/iam-route-inventory.test.ts tests/unit/fleet-statement-decisions-20261013/incident-links.test.ts tests/unit/system-remediation/sr-qa-call-001/c046-incident-suppression-recovery.test.ts` → 53/53 passed.
- `apps/api`: `npx vitest run tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-provider-adapters.test.ts tests/unit/driver-sos-attachment.service.test.ts tests/unit/driver-sos-incident.test.ts tests/unit/driver-sos-verification.repository.test.ts` → 27/27 passed (these files are untouched this round; confirms no incidental regression).
- Not re-run this round: `apps/api`'s full `vitest run` (its integration
  suite requires a live `DATABASE_URL`, which this VM's dispatch runtime
  restriction does not provide; this is a pre-existing environment
  limitation, not introduced by this change) — scoped unit coverage above
  substitutes for it.

## Round 4: reviewer reopen (2026-10-16T01:32:31Z) findings and fixes

Codex's independent full-scope review reopened frozen candidate `96f038806`
(generation `c0c163439daa4c0eb42d3540c82ca47f`, PR #2707) with four findings
(F1-F4), all with concrete socket-free production-module reproductions. Each
is addressed below.

| Finding / acceptance key | Code location (before) | Fix | Regression test |
| --- | --- | --- | --- |
| F1 [P1] `acknowledgeDuty` could report `wonAcknowledgement: true` while the correlated Incident already had a *different* real owner: it called `IncidentService.updateIncident(incidentId, { assignedTo: actorId })` only *after* the SOS-side CAS had already committed `actorId` as the owner, and silently swallowed `INCIDENT_ASSIGNMENT_CONFLICT` — so a direct `PATCH /api/incidents/:id` by another caller (the real reachable path, not only this SOS flow) could leave the SOS event and the Incident disagreeing about who owns the case ("two current owners"). | `driver-sos.service.ts` `acknowledgeDuty` (old inline try/catch around `incidentService.updateIncident`) | Added a **read-only** pre-check, `resolveIncidentOwnerForAcknowledgement`, that reads the Incident's current `assignedTo` *before* the SOS-side CAS write (no mutation, so a later SOS-CAS failure still never touches the Incident — preserving the round-2 ordering guarantee). If the Incident already has an owner, that owner — not the caller's `actorId` — is what the SOS event's own CAS write claims, so the two subsystems can never diverge. The post-persistence handover call (`repairIncidentHandover`, same swallow-only-same-owner-conflict semantics as before) now always converges the Incident onto whichever owner the SOS side actually ended up persisting, and also re-runs on every *idempotent* replay (previously the `existingOwner` early-return skipped it entirely, so a prior async Incident-persistence failure could never be repaired by a retry). | `tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts`: "F1: does not report a successful duty claim when the Incident is already assigned to a different owner by a direct caller" (reproduces the exact repro: Incident assigned to `ops-existing` via `updateIncident` directly, then `acknowledgeDuty` called by `ops-new`; asserts `wonAcknowledgement === false`, both the ACK response and a subsequent readback report `ops-existing` as the single owner, and the Incident itself still shows `ops-existing`) and "F1: a failed SOS-side CAS write never leaves the Incident reassigned, even once the Incident is checked first" (re-confirms the round-2 guarantee still holds with the new read-only pre-check in place). |
| F2 [P2] Two concurrent authoritative readbacks (`getOwnEventForDriver` / `getEventForOps` / `getEventByIncidentIdForOps`) for the same event could both execute `reconcileWithIncident` before either had awaited `persistStatusTransition`, so both observed the same pre-transition rank and both appended their own copy of the same forward-progression timeline entry (duplicate `investigation_started`/`resolved`/`closed`). | `driver-sos.service.ts` `reconcileWithIncident` (no serialization across concurrent calls for the same `sosEventId`) | Added `reconcileQueues`, a per-`sosEventId` async lock (reusing the same `withQueueLock` primitive the round-2 `acknowledgeDutyQueues` already used, now extracted as a static helper). The locked body (`reconcileWithIncidentLocked`) re-reads the event's *current* state from `eventById` at lock-acquisition time instead of trusting the caller's snapshot, so a second concurrent readback that is unblocked after the first already committed the transition sees the already-advanced rank and is a no-op. | "F2: two concurrent authoritative readbacks across both realms never both append the same forward-progression timeline entry" — fires `getOwnEventForDriver` and `getEventForOps` via `Promise.all` immediately after an Incident status change to `investigating`, asserts exactly one `investigation_started` timeline entry total. |
| F4 [P1] On a losing duty-ack CAS (`accepted: false`), the service synthesized a "lost" event from its own stale local snapshot and returned the caller's own stale local timeline — never reloading the actual winner's timeline/outbox from the authoritative store. A process whose own cache never attempted (or lost) the ACK could keep reporting zero `duty_acknowledged` timeline entries / `pending` indefinitely. | `driver-sos.service.ts` `acknowledgeDuty` (the `if (!accepted)` branch); `driver-sos.repository.ts` (no single-event reload existed) | Added `DriverSosRepository.reloadEventState(sosEventId)` (event + full timeline + outbox, straight from the DB — mirrors the existing `loadExistingSubmission` query shape). Added `DriverSosService.hydrateFromAuthoritativeStoreIfPending`, called (a) in the losing-CAS branch of `acknowledgeDuty` before building the idempotent response, and (b) at the start of all three readback methods whenever the local cache still shows no owner — so a cross-process winner's state is picked up instead of continuing to serve stale local maps. No-op (by construction) once the local cache already has an owner, or when no `DriverSosRepository` is wired (pure in-memory mode). | "F4: a losing duty-ack CAS result hydrates this process's cache from the authoritative store instead of returning zero timeline entries" — mocks only `persistDutyAcknowledgement` (returns `accepted: false` for a different owner) and `DriverSosRepository.reloadEventState` (returns the winner's real timeline), asserts the ACK response *and* a subsequent `getEventForOps` readback both report exactly one `duty_acknowledged` timeline entry for the true winner. |
| F3 [P2] Native `isDriverSosStatusTerminal` included `"resolved"` in its terminal set, so `sos.tsx`'s readback-polling `useEffect` stopped polling as soon as the event reached `resolved` — even though the backend explicitly supports `resolved -> closed` (reconciled by round-2's `reconcileWithIncident`). A later `closed` transition (including on a case restored from storage while already `resolved`) was never observed. | `apps/driver-app/lib/driver-sos-outbox.ts` `DRIVER_SOS_TERMINAL_STATUSES` | Removed `"resolved"` from the terminal set; only `"closed"` and `"false_alarm_dismissed"` are genuine dead ends per the `SOS_PROGRESS_RANK` the backend already reconciles against. No change needed to the polling effect itself (`sos.tsx`'s `sosReadbackIsTerminal` already recomputes from `activeCase.status` on every render, including right after `loadDriverSosActiveCase` restores a saved case). | `apps/driver-app/tests/unit/driver-sos-outbox.test.ts`: "F3: does not treat resolved as terminal, so readback can still progress to closed" — asserts `isDriverSosStatusTerminal("resolved") === false`, `"closed"`/`"false_alarm_dismissed"` still terminal, and drives `applyDriverSosDutyReadback` through `resolved -> closed` confirming the `closed` timeline entry is reachable. |

Residual limitation carried forward from F1 (documented, not claimed fixed):
`IncidentService.persist()` (`apps/api/src/modules/incident/incident.service.ts`,
outside this task's `write_scopes`) is fire-and-forget — it does not return a
promise a caller can await or inspect for durable-write failure. This repair
stays entirely within the authorized `driver-sos` files per the reopen's
repair-boundary instruction: the read-only pre-check plus always-retried
post-persistence handover close the *ownership-disagreement* race (the
concretely reproduced repro) and make every idempotent replay retry the
Incident write, but a true async Postgres-level failure inside `persist()`
still cannot be observed from outside `IncidentService` without a shared
interface change, which per the reopen text requires separate Root-scope
coordination.

Full re-verification after round-4 fixes:

- Root: `pnpm exec vitest run tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts tests/unit/system-remediation/sr-qa-call-001/c047-sos-duty-lifecycle.test.ts` → 25/25 passed (21 pre-existing + 4 new round-4 cases).
- Root: `pnpm exec vitest run tests/security/iam-auth-negative-matrix.test.ts tests/security/iam-driver-authz-enforcement.test.ts tests/security/iam-route-driver-negative.test.ts tests/security/iam-route-inventory.test.ts tests/unit/fleet-statement-decisions-20261013/incident-links.test.ts tests/unit/system-remediation/sr-qa-call-001/c046-incident-suppression-recovery.test.ts` → 53/53 passed (no regression).
- `apps/api`: `pnpm exec vitest run tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-provider-adapters.test.ts tests/unit/driver-sos-attachment.service.test.ts tests/unit/driver-sos-incident.test.ts tests/unit/driver-sos-verification.repository.test.ts` → 27/27 passed (untouched this round; confirms no incidental regression).
- `apps/driver-app`: `pnpm test` → 547/547 passed (546 pre-existing + 1 new F3 case); `pnpm exec tsc --noEmit -p tsconfig.json` (run from repo root with `-p apps/driver-app/tsconfig.json`) → clean.
- `apps/ops-console-web`: `pnpm exec tsc --noEmit -p apps/ops-console-web/tsconfig.json` → clean. The two Ops SOS pages were read (not modified): both already branch on `wonAcknowledgement` and render `dutyAcknowledgement.acknowledgedByActorId` on the losing path, so they display correctly now that the backend's `wonAcknowledgement`/owner are honest — no page-level change was needed for F1.
- `git diff --check` → clean (no whitespace errors).

## Round 5: reviewer reopen (2026-10-16T02:05:43Z) findings and fixes

Codex's independent review reopened candidate `571ecb2ae` (generation
`eb996720bbfd4bff9d354de253c9bb00`, PR #2707) with F1/F2/F4 findings that
survived round 4's fixes, each with a concrete socket-free production-module
reproduction. Root/Supervisor confirmed (2026-10-16T04:44:22Z,
`.local/goal-continuation-20261016T044422Z-.../SOS-exact-awaited-Incident-assignment-repair-unit-and-original-Incident-holder-handoff.json`)
the F1 durable-write sub-trigger genuinely requires editing
`apps/api/src/modules/incident/incident.service.ts` /
`incident.repository.ts`, and widened `write_scopes` to include exactly
those two files, scoped to a new assignment-persistence/current-owner
handover seam only — no change to any other `IncidentService` method or
caller.

| Finding / acceptance key | Code location (before) | Fix | Regression test |
| --- | --- | --- | --- |
| F1 [P1] round-4's read-only pre-check (`resolveIncidentOwnerForAcknowledgement`) read the Incident's owner *before* the SOS-side CAS write, then only wrote the handover *after* that write settled. A genuinely concurrent direct `PATCH /api/incidents/:id` landing in that window could win the Incident assignment while this call's SOS-side CAS independently committed a different owner — `repairIncidentHandover` then hit `INCIDENT_ASSIGNMENT_CONFLICT` and silently swallowed it, leaving the Incident and the SOS event permanently disagreeing. Separately, `IncidentService.persist()` is fire-and-forget: a rejected Postgres write was unobservable, so a DB failure on the Incident side still let the SOS command report success. | `driver-sos.service.ts` `acknowledgeDuty`; `incident.service.ts` (no durable/awaitable assignment facade existed) | Added `IncidentService.assignIncidentOwnerDurable(incidentId, owner, requestId, identity)`: a narrow, additive facade (not a change to `updateIncident`'s existing fire-and-forget semantics for any other caller) that commits the same win/lose assignment decision **synchronously**, before its own first `await` — atomic with respect to every other synchronous mutation of Incident state, including a concurrent direct `updateIncident` call — and then durably awaits `IncidentRepository.persistChanges` before reporting success; a rejected durable write rolls the in-memory claim back and reports `accepted: false, currentOwner: null`. `acknowledgeDuty` now calls this facade as its real first write, *before* the SOS-side CAS (not merely a read-only check beforehand), so no concurrent direct assignment can land unnoticed in the gap, and a `currentOwner: null` result (durable Incident write failed outright) makes the call throw `INCIDENT_HANDOVER_UNAVAILABLE` (retryable) instead of fabricating a successful SOS ack. To preserve the existing "a rejected SOS-side write never leaves the Incident falsely mutated" guarantee, a *freshly claimed* Incident ownership (`wasNewClaim: true`) is rolled back via the new `IncidentService.releaseIncidentOwnerClaim` if the subsequent SOS-side CAS write then throws. `acknowledgeDutyQueues` and `reconcileQueues` were unified into one `eventMutationQueues` per `sosEventId` (see F2) so this claim-then-write sequence and any concurrent readback/reconcile for the same event can never interleave either. | `tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts`: "F1: a genuinely overlapping direct Incident assignment cannot land underneath an in-flight acknowledgment and go unnoticed" (holds `persistDutyAcknowledgement` open via a deferred promise, attempts a real direct `updateIncident` while the ack is still awaiting it, asserts the direct call now gets `INCIDENT_ASSIGNMENT_CONFLICT` and the final state is single-owner-consistent) and "F1: a failed durable Incident handover write makes acknowledgeDuty fail honestly instead of reporting success" (mocks `IncidentRepository.persistChanges` to reject, asserts `acknowledgeDuty` throws `INCIDENT_HANDOVER_UNAVAILABLE` and both the Incident and the SOS event remain unassigned/unacknowledged — not falsely successful). The two round-3/round-4 regression tests covering the rejected-SOS-write-never-mutates-Incident guarantee continue to pass unchanged. |
| F2 [P1] follow-up: round-4's fix added a *separate* `reconcileQueues` lock distinct from `acknowledgeDutyQueues`. `reconcileWithIncidentLocked` captured an event snapshot, awaited `persistStatusTransition`, and then unconditionally `replaceEvent`d a record built from that pre-await snapshot — while held open, a concurrent `acknowledgeDuty` call (serialized only against the *other* queue) could commit its own ack via `replaceEvent`, which the reconcile's later `replaceEvent` would then silently overwrite with the stale pre-ack snapshot, erasing the acknowledgment (`ackOwner` present but `readbackOwner: null` after reconcile completed). | `driver-sos.service.ts` (`acknowledgeDutyQueues` + `reconcileQueues` as two independent per-event locks) | Unified both into a single `eventMutationQueues` map and one `withEventMutationLock` helper. `acknowledgeDuty` acquires it for its entire body (as before); the three readback methods (`getEventForOps`, `getEventByIncidentIdForOps`, `getOwnEventForDriver`) now go through a new `hydrateAndReconcile` that acquires the lock exactly once and runs authoritative-store hydration + `reconcileWithIncidentLocked` inside it. Every mutation path for a given `sosEventId` — acknowledgment, DB hydration, and Incident-progression reconcile — is now strictly serialized, so a reconcile's delayed write can never land after (and overwrite) a concurrent acknowledgment, or vice versa. | "F2: a concurrent authoritative reconcile can never overwrite an in-flight (or just-completed) acknowledgment with a stale pre-ack snapshot" — holds `persistStatusTransition` open via a deferred promise inside a `getOwnEventForDriver` reconcile, starts a real `acknowledgeDuty` call while it is held (proving by construction, via the unified lock, that the ack cannot start until the reconcile fully settles), then asserts a subsequent `getEventForOps` readback still reports the ack's owner. |
| F4 [P1] follow-up: `hydrateFromAuthoritativeStoreIfPending` had two gates that stopped freshness short of full lifecycle coverage: (a) it skipped calling `reloadEventState` *entirely* once the local cache already had a duty owner, so a later authoritative transition (e.g. a different process closing the event) was never picked up; (b) even when it did reload, it discarded the result whenever the authoritative row had no owner yet, so a legitimate unowned forward transition (`submitted -> duty_alerted`) was dropped and the stale `submitted` snapshot kept being served. | `driver-sos.service.ts` `hydrateFromAuthoritativeStoreIfPending` | Removed both gates. The function now always reloads (repository present, not a dismissed false alarm) and merges via a new `DriverSosService.preferForwardProgress(cached, authoritative)`: the authoritative (DB) record wins whenever its `SOS_PROGRESS_RANK` is at least as high as the cached one — including ties, so a different owner at the same rank is still picked up — and only falls back to the cached record when the authoritative read is actually behind (stale replica) or either status is unranked. This covers both the "later status without a known owner" case and the "later status despite an already-known owner" case with one monotonic rule, instead of two separate ad hoc gates. | "F4: an authoritative later status without a known owner still propagates on readback instead of staying stuck at the cached status" (mocks `reloadEventState` to return `duty_alerted`/no owner against a cached `submitted` event, asserts the readback reports `duty_alerted`) and "F4: an authoritative closed status propagates on readback even once this process already knows a duty owner" (acknowledges normally, then mocks `reloadEventState` to return `closed`, asserts the readback reports `closed` instead of staying at `acknowledged`). |

Residual limitation (unchanged from round 4, now narrower): the new
`assignIncidentOwnerDurable`/`releaseIncidentOwnerClaim` facade covers the
*assignment* seam only. `IncidentService.persist()`'s other six call sites
(status/severity/escalation/suppression/service-recovery/dispatch-exception
mutations) remain fire-and-forget, unchanged, per the Root-confirmed
narrow-scope instruction — this task never claimed those paths, and SOS
only ever reads Incident status (via `reconcileWithIncidentLocked`), never
writes it.

Full re-verification after round-5 fixes:

- Root: `pnpm exec vitest run tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts tests/unit/system-remediation/sr-qa-call-001/c047-sos-duty-lifecycle.test.ts tests/unit/fleet-statement-decisions-20261013/incident-links.test.ts` → 39/39 passed (25 pre-existing + 5 new round-5 cases, split across the duty-ack-race-and-readback and incident-links files).
- Root: `pnpm exec vitest run tests/security/iam-auth-negative-matrix.test.ts tests/security/iam-driver-authz-enforcement.test.ts tests/security/iam-route-driver-negative.test.ts tests/security/iam-route-inventory.test.ts tests/unit/system-remediation/sr-qa-call-001/c046-incident-suppression-recovery.test.ts` → 44/44 passed (no regression).
- `apps/api`: `pnpm exec vitest run tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-provider-adapters.test.ts tests/unit/driver-sos-attachment.service.test.ts tests/unit/driver-sos-incident.test.ts tests/unit/driver-sos-verification.repository.test.ts tests/unit/incident.controller.test.ts tests/unit/incident-escalation-service-recovery.test.ts tests/unit/complaint-incident-escalation.test.ts tests/integration/int-s3-001-driver-sos-idempotency.test.ts` → 71/71 passed (the incident/complaint suites are untouched this round; confirms no incidental regression from the new `IncidentService` methods).
- `apps/driver-app`: `pnpm test` → 547/547 passed (untouched this round). `apps/driver-app` and `apps/ops-console-web`: `npx tsc --noEmit -p <tsconfig>` → both clean.
- `apps/api`: `npx tsc -p apps/api/tsconfig.json --noEmit` → zero errors referencing `driver-sos` or `incident.service`/`incident.repository`/`incident.controller`; remaining root typecheck errors are pre-existing in unrelated modules (`tenant-partner`, `regulatory-registry`, `regulatory-reporting`, `reporting-filing`, `platform-admin`, `voice-booking`, `passenger-app`, `sandbox-governance`, `vehicle-eligibility`), none in this task's `write_scopes`, unmodified by this branch.
- `npx eslint` on both modified source files and the modified test file → no errors.
- `git diff --check` → clean (no whitespace errors).
- Not re-run this round: `apps/api`'s repo-root `tsc --noEmit -p apps/api/tsconfig.json` reports pre-existing errors in unrelated modules (`passenger-app`, `platform-admin`, `regulatory-registry`, `tenant-partner`, `voice-booking`, etc. — stale `@drts/contracts` exports and other drift, consistent with prior rounds' noted gap); confirmed zero errors reference any `driver-sos` or `incident.service` file (`grep -i "driver-sos\|incident.service"` on the tsc output was empty). Real PostgreSQL CAS execution, browser/UI interaction, and Android/iOS live device delivery remain out of this VM's scope per the dispatch restriction, same as all prior rounds.

## Round 6: reviewer reopen (2026-10-16T06:22:29Z) findings and fixes

Codex's independent exact-candidate REOPEN reviewed frozen candidate
`083572f9fc651b5812923aceee45486faf4bc444` (generation
`cb9d48b3b497463ebeabee49775ff341`, PR #2707) with F1/F1-competing-instance/
F2/F2-progression/F5 findings that survived round 5's fixes, each with a
concrete socket-free production-module reproduction. All five are within the
already-widened `write_scopes` (`incident.service.ts`, `driver-sos.service.ts`)
confirmed by round 5's Root/Supervisor scope coordination; no further scope
widening was needed.

| Finding / acceptance key | Code location (before) | Fix | Regression test |
| --- | --- | --- | --- |
| F1 [P1] `assignIncidentOwnerDurable`'s "already the same owner" branch (`incident.assignedTo === owner`) returned `{ accepted: true, wasNewClaim: false }` immediately on an in-memory equality check alone, without ever confirming that ownership was durably persisted. A prior writer's own durable write (e.g. the generic `updateIncident` fire-and-forget `persist()`) could still be pending or have already failed; this call — and a later idempotent-replay's `repairIncidentHandover`, which hits the exact same branch — both reported a false win on top of that unconfirmed state. | `incident.service.ts` `assignIncidentOwnerDurable` (`if (incident.assignedTo === owner) return { accepted: true, ... }`) | The "already owner" branch now re-confirms durability: when an `IncidentRepository` is wired, it `await`s `persistChanges` for the current record before reporting `accepted: true`; a rejection reports `accepted: false, currentOwner: owner` (not `null`, since the in-memory value is left untouched — there is nothing to roll back for an ownership this call did not freshly create) instead of a silent win. `acknowledgeDuty`'s throw condition was broadened from `claim.currentOwner === null` to `claim.currentOwner === null \|\| claim.currentOwner === actorId`, so this "durability unknown for our own owner" result now also throws `INCIDENT_HANDOVER_UNAVAILABLE` instead of proceeding to persist a false SOS ack; a genuine conflict (`currentOwner` is a real *different* owner) still proceeds as before, unchanged. | `tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts`: "F1: acknowledgeDuty fails honestly instead of claiming a win when the Incident's existing in-memory ownership was never durably confirmed" — reproduces the exact repro (direct `updateIncident({ assignedTo })` with a rejecting `IncidentRepository.persistChanges`, then `acknowledgeDuty` for the same actor), asserts `INCIDENT_HANDOVER_UNAVAILABLE` and that the SOS event stays unacknowledged. Confirmed to fail against the pre-fix code (`expected undefined to be 'INCIDENT_HANDOVER_UNAVAILABLE'`) before the fix, and pass after. |
| F1 competing-instance [P1] `acknowledgeDuty`'s convergence branch (`if (finalOwner !== incidentOwner) await this.repairIncidentHandover(...)`) discarded `repairIncidentHandover`'s return value. When this call's own *fresh* Incident claim (`claimedFreshIncidentOwnership: true`) lost a legitimate competing SOS-side CAS write to a different authoritative winner, `repairIncidentHandover` tried to assign that winner onto an Incident still durably held by this call's own (losing) claim — hit the ordinary "different owner" conflict branch, and silently discarded it. The Incident stayed wrongly assigned to the local loser forever; no replay could converge it, since the loser's claim was never released. | `driver-sos.service.ts` `acknowledgeDuty` (the `if (finalOwner !== incidentOwner)` convergence block) | Before calling `repairIncidentHandover(finalOwner)`, the block now checks `claimedFreshIncidentOwnership` and, if true, first calls the existing `IncidentService.releaseIncidentOwnerClaim(incidentId, incidentOwner, ...)` to release this call's own losing claim — matching the same release already used on a thrown persistence error, just reused for a returned-loss result instead. This empties the Incident's `assignedTo` back to `null` so the subsequent `repairIncidentHandover(finalOwner)` call can actually claim it for the real winner instead of hitting a self-inflicted conflict. | "F1 competing-instance: a losing SOS-side CAS result releases this call's own fresh Incident claim so the real winner can durably converge" — mocks only `persistDutyAcknowledgement` to return a legitimate competing-writer loss (`accepted: false, acknowledgedByActorId: "ops-db-winner"`), asserts the Incident ends up durably assigned to the real winner, not the local loser. Confirmed to fail against the pre-fix code (`expected 'ops-local-claim' to be 'ops-db-winner'`) before the fix. |
| F2 [P1] `recordOpsAlertsRendered` built its `duty_alerted` transition (`dutyAlertPlan`) from a snapshot of `this.eventById.get(sosEventId)` captured *before* `await this.verificationRepository?.persistAlertObservation(...)`, then unconditionally `replaceEvent`d that stale pre-await snapshot on the response's return — entirely outside the per-event mutation lock `acknowledgeDuty` uses. A concurrent `acknowledgeDuty` call that committed in the meantime (a legitimate ordering: a render can commit in the DB before an ACK while its own response resolves after) was silently erased, including its `dutyAcknowledgement`, and a subsequent ACK replay then re-claimed the event via the "fresh" branch, producing a second local `duty_acknowledged` timeline entry. | `driver-sos.service.ts` `recordOpsAlertsRendered` (the `this.replaceEvent(dutyAlertPlan.event)` call after the `persistAlertObservation` await) | The `duty_alerted` transition is now applied inside `withEventMutationLock(outbox.sosEventId, ...)` — the same per-event lock `acknowledgeDuty` and the readback methods already serialize on — and re-reads the event's *live* status at that point (`this.eventById.get(outbox.sosEventId)`) instead of the stale pre-await snapshot; it only applies the transition if the live status is still `"submitted"`, so a render response that resolves after a concurrent ACK (or any other mutation) is a no-op instead of a clobber. | "F2: a render observation that resolves after a concurrent acknowledgment completes does not erase the ack or duplicate its timeline on replay" — holds `persistAlertObservation` open via a deferred promise, commits a real `acknowledgeDuty` call while it is held, then resolves the render response; asserts the readback still reports the ack's owner/status and a replay does not duplicate the `duty_acknowledged` timeline entry. Confirmed to fail against the pre-fix code (`expected null to be 'ops-render-race'` — the ack was erased) before the fix. |
| F2 progression subtrigger [P2] `acknowledgeDuty` always set `status: "acknowledged"` on a fresh (non-idempotent) acknowledgment, regardless of the event's current status. A real reachable order — `updateIncident({ status: "investigating" })` then a readback that reconciles `"investigating"` onto the SOS event, then a late `acknowledgeDuty` for that same event — moved the status backward from `"investigating"` to `"acknowledged"`, contradicting the forward-only `SOS_PROGRESS_RANK` the readback reconciliation already enforces elsewhere. | `driver-sos.service.ts` `acknowledgeDuty` (`const updatedEvent = { ...event, status: "acknowledged", ... }`, and the matching losing-CAS fallback `lostEvent`) | Both the success-path `updatedEvent` and the losing-CAS `lostEvent` fallback now compute `nextStatus` using the same `SOS_PROGRESS_RANK` table the existing readback reconciliation (`reconcileWithIncidentLocked`) already uses: `status` only advances to `"acknowledged"` when the event's current rank is still below the `"acknowledged"` rank; otherwise the event's current (already-advanced) status is preserved while `dutyAcknowledgement` is still filled in honestly. | "F2 progression: acknowledging duty after the Incident has already progressed to investigating does not move the SOS event's status backward" — drives the Incident to `"investigating"`, reconciles it onto the SOS event via a readback, then acknowledges; asserts the ack response and a subsequent readback both report `status === "investigating"` (not regressed to `"acknowledged"`) while the duty owner is still filled in. Confirmed to fail against the pre-fix code (`expected 'acknowledged' to be 'investigating'`) before the fix. |
| F5 [P1] `assignIncidentOwnerDurable`'s rollback-on-persistence-failure (`this.replace(incident)`) restored the *entire* pre-claim snapshot captured before the method's first `await`. Any unrelated concurrent mutation of the same Incident that landed on it while the claim's durability confirmation was in flight (e.g. a status change via a direct `updateIncident` call) was silently discarded along with the claim's own `assignedTo`. | `incident.service.ts` `assignIncidentOwnerDurable` (the `catch` block's `this.replace(incident)`) | The rollback now re-reads the Incident's *current* state (`const current = this.require(incidentId)`) at rollback time instead of reusing the stale pre-claim snapshot, and only reverts the `assignedTo` field this call itself set (only if it is still exactly this call's `owner` — otherwise something else has already changed it and this rollback leaves it alone), preserving every other field (status, suppression, etc.) from the fresh read. `currentOwner` in the returned result is likewise derived from the fresh read, not the stale snapshot. | "F5: rolling back a rejected fresh Incident claim does not erase a status change that landed on the Incident while the claim write was in flight" — holds the claim's `persistChanges` open via a deferred promise, lands a real concurrent `updateIncident({ status: "investigating" })` while it is pending, then rejects the claim write; asserts `assignedTo` is rolled back to `null` but `status` still reads `"investigating"`. Confirmed to fail against the pre-fix code (`expected 'open' to be 'investigating'` — the whole pre-claim snapshot, including the original `"open"` status, was restored) before the fix. |

`IncidentService.releaseIncidentOwnerClaim` was additionally switched from
the fire-and-forget `this.persist(...)` helper to an `await`ed
`this.incidentRepository.persistChanges(...)` with
`reportPersistenceFailure` on rejection (best-effort — the in-memory release
already happened; a persistent failure is now reported instead of silently
fire-and-forget, consistent with the durability-confirmation discipline F1
requires elsewhere in this same seam).

All five fixes were verified by the standard before/after method: the new
regression tests were run once against the pre-fix candidate
`083572f9f` (via a scoped `git stash` of only the two source files, leaving
the new tests in place) and all five failed with the exact mismatches
quoted above; then the source fix was restored and all five passed. No
candidate test/source files were created outside this round's actual fix
scope.

Full re-verification after round-6 fixes:

- Root: `pnpm exec vitest run tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts tests/unit/system-remediation/sr-qa-call-001/c047-sos-duty-lifecycle.test.ts tests/unit/fleet-statement-decisions-20261013/incident-links.test.ts tests/unit/system-remediation/sr-qa-call-001/c046-incident-suppression-recovery.test.ts` → 52/52 passed (4 files; includes the 5 new round-6 regression cases in `duty-ack-race-and-readback.test.ts`, now 19 cases in that file, up from 14 before this round).
- Root: `pnpm exec vitest run tests/security/iam-auth-negative-matrix.test.ts tests/security/iam-driver-authz-enforcement.test.ts tests/security/iam-route-driver-negative.test.ts tests/security/iam-route-inventory.test.ts` → 36/36 passed (no regression; `auth.policy.ts` untouched this round).
- `apps/api`: `pnpm exec vitest run tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-provider-adapters.test.ts tests/unit/driver-sos-attachment.service.test.ts tests/unit/driver-sos-incident.test.ts tests/unit/driver-sos-verification.repository.test.ts tests/unit/incident.controller.test.ts tests/unit/incident-escalation-service-recovery.test.ts tests/unit/complaint-incident-escalation.test.ts tests/integration/int-s3-001-driver-sos-idempotency.test.ts` → 71/71 passed (no regression from the F1/F5 `IncidentService` changes or the F2 `driver-sos.service.ts` changes).
- `apps/driver-app`: `pnpm exec vitest run tests/unit/driver-sos-outbox.test.ts tests/unit/driver-sos-end-to-end-platform.test.ts tests/unit/driver-sos-no-os-dialer.test.ts` → 16/16 passed (untouched this round).
- `apps/driver-app`: `pnpm exec tsc --noEmit --incremental false -p apps/driver-app/tsconfig.json` → clean.
- `apps/ops-console-web`: `pnpm exec tsc --noEmit --incremental false -p apps/ops-console-web/tsconfig.json` → clean.
- `pnpm exec eslint` on both modified source files and the modified test file → no errors.
- `git diff --check` → clean (no whitespace errors).
- Not re-run this round: `apps/api`'s repo-root `tsc --noEmit -p apps/api/tsconfig.json` reports pre-existing errors in unrelated modules (`tenant-partner`, `voice-booking`, `regulatory-reporting`, `reporting-filing`, `sandbox-governance`, `vehicle-eligibility` — stale `@drts/contracts` exports/type drift, consistent with prior rounds' noted gap); confirmed zero errors reference `driver-sos` or `incident.service`/`incident.repository` (`grep` on the tsc output was empty). Real PostgreSQL CAS/competing-process execution, browser/UI interaction, and Android/iOS live device delivery remain out of this VM's scope per the dispatch restriction, same as all prior rounds. This round's push produces a new candidate SHA; hosted CI, independent review, and merge/acceptance evidence for it are recorded by the normal candidate lifecycle, not claimed here.

## Round 7: reviewer reopen (2026-10-16T06:57:45Z) findings and fixes

Codex's independent exact-candidate REOPEN reviewed frozen candidate
`8d0c08ab8211c0449f35297f3389ee75e0be94f9` (generation
`b202b8ae4a064690a7f508ad0426cf14`, PR #2707) with F1 durability
(foreign-owner branch), F1 competing-instance convergence (non-fresh
claim), F2 cross-instance progression, and F5 rollback durability findings.
This round repairs the two F1 sub-findings, which share the exact same
`assignIncidentOwnerDurable` / `repairIncidentHandover` seam R6 already
widened scope for; F2 cross-instance progression (authoritative
`driver-sos-verification.repository.ts` persistence) and F5's remaining
concurrent-accepted-writer leak (generic `updateIncident`'s unconditional
full-record upsert racing a claim rollback) are each a different
persistence seam and are intentionally left for the next small unit per
Guide §0.7's one-independently-verifiable-unit-at-a-time discipline; they
are NOT claimed fixed by this round.

| Finding / acceptance key | Code location (before) | Fix | Regression test |
| --- | --- | --- | --- |
| F1 durability [P1] `assignIncidentOwnerDurable`'s foreign-owner branch (`incident.assignedTo && incident.assignedTo !== owner`) returned `{ accepted: false, currentOwner: incident.assignedTo }` directly from the in-memory value with zero durability confirmation — unlike the already-equal-owner branch R6 fixed. `acknowledgeDuty` then trusted that unconfirmed foreign value as `incidentOwner` and persisted a `duty_acknowledged` SOS timeline under it. On idempotent replay by that same (still-unconfirmed) actor, `assignIncidentOwnerDurable`'s equal-owner branch re-attempted confirmation, but `repairIncidentHandover`'s `catch`-only error handling discarded its returned `{ accepted: false }` result entirely (only a *thrown* error was ever caught), so the replay still reported `wonAcknowledgement: true` on top of a durably-rejected confirmation. | `incident.service.ts` `assignIncidentOwnerDurable` (the `if (incident.assignedTo && incident.assignedTo !== owner)` branch) | The foreign-owner branch now confirms durability the same way the equal-owner branch already does: when an `IncidentRepository` is wired, it `await`s `persistChanges` for the current record before reporting the foreign owner as a real conflict. A rejection returns `currentOwner: null` (not the foreign label) — reusing `acknowledgeDuty`'s existing `claim.currentOwner === null` → `INCIDENT_HANDOVER_UNAVAILABLE` throw, so no code change was needed in `driver-sos.service.ts` for this sub-fix; an actually-durable foreign conflict still proceeds as a truthful win for that owner, unchanged. | `tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts`: "F1: a different Ops actor's acknowledgeDuty fails honestly instead of winning under an unconfirmed foreign Incident owner, and the original actor's replay also fails until durability is confirmed" — reproduces the exact Codex repro (direct `updateIncident({ assignedTo: "ops-unconfirmed" })` with a rejecting `IncidentRepository.persistChanges`, then a *different* actor's `acknowledgeDuty`, then the original actor's replay, then recovery once the repository stops rejecting), asserting `INCIDENT_HANDOVER_UNAVAILABLE` for both failing attempts, no SOS mutation in between, and an honest durable win once the repository recovers. |
| F1 competing-instance convergence [P1] `repairIncidentHandover` always called `assignIncidentOwnerDurable`, which applies first-owner-wins arbitration. R6 only released this call's own *fresh* claim (`claimedFreshIncidentOwnership: true`) before calling it. When the Incident's current owner was instead an *existing* (non-fresh) assignment — e.g. a separate service instance's own prior direct claim — `wasNewClaim` was `false`, so nothing was released, and `repairIncidentHandover`'s attempt to converge the Incident onto the SOS side's real winner hit `assignIncidentOwnerDurable`'s foreign-owner branch as an ordinary conflict and was silently discarded. The Incident stayed durably assigned to a loser that never actually won the SOS CAS, with no replay able to converge it. | `incident.service.ts` (no non-arbitrating convergence path existed); `driver-sos.service.ts` `repairIncidentHandover` (called `assignIncidentOwnerDurable`) | Added `IncidentService.convergeIncidentOwnerDurable(incidentId, owner, requestId, identity)`: a narrow facade used only by `repairIncidentHandover`, which by construction only ever runs once the SOS side has already durably decided `owner` as the real truth (an idempotent replay, or a resolved cross-process CAS race) — so it force-converges the Incident onto that truth instead of re-arbitrating ownership, while still durably confirming the write and rolling back to the prior owner (preserving any unrelated concurrent mutation, same discipline as R6's F5 rollback) if the write is rejected. `repairIncidentHandover` now calls this new method instead of `assignIncidentOwnerDurable`; its existing `catch`-and-ignore (best-effort, next replay retries) is unchanged, since the new method throws on failure rather than returning a silently-discardable result object. | "F1 competing-instance: a non-fresh (already-assigned) Incident owner still durably converges to the real SOS-side CAS winner" — assigns the Incident to a different actor via a direct `updateIncident` call *before* `acknowledgeDuty` runs (so the resulting claim is never a fresh one, `wasNewClaim: false`), mocks only `persistDutyAcknowledgement` to return a legitimate competing-writer loss to a different winner, and asserts the Incident ends up durably assigned to that real winner instead of staying stuck on the non-fresh loser. |

Both new regression tests were verified by the standard before/after
method: run once against this round's pre-fix source (the two `incident.service.ts`
edits reverted via a scoped diff, with the new tests in place) — both
failed with the exact mismatches described above (`currentOwner` resolving
to the unconfirmed label instead of `null`; the Incident staying on
`ops-local-loser` instead of converging to `ops-db-winner`) — then the
source fix was restored and both passed. F2 and F5 are unchanged by this
round and remain open findings; they are not represented as fixed anywhere
in this document.

Full re-verification after round-7 fixes:

- Root: `pnpm exec vitest run tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts tests/unit/system-remediation/sr-qa-call-001/c047-sos-duty-lifecycle.test.ts tests/unit/fleet-statement-decisions-20261013/incident-links.test.ts tests/security/iam-auth-negative-matrix.test.ts tests/security/iam-driver-authz-enforcement.test.ts tests/security/iam-route-driver-negative.test.ts tests/security/iam-route-inventory.test.ts tests/unit/system-remediation/sr-qa-call-001/c046-incident-suppression-recovery.test.ts` → exit 0, 8 files / 90 tests (88 pre-existing + 2 new round-7 cases in `duty-ack-race-and-readback.test.ts`, now 21 cases in that file, up from 19 before this round).
- `apps/api`: `pnpm exec vitest run tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-provider-adapters.test.ts tests/unit/driver-sos-attachment.service.test.ts tests/unit/driver-sos-incident.test.ts tests/unit/driver-sos-verification.repository.test.ts tests/unit/incident.controller.test.ts tests/unit/incident-escalation-service-recovery.test.ts tests/unit/complaint-incident-escalation.test.ts tests/integration/int-s3-001-driver-sos-idempotency.test.ts` → exit 0, 9 files / 71 tests (no regression).
- `apps/driver-app`: `pnpm exec vitest run tests/unit/driver-sos-outbox.test.ts tests/unit/driver-sos-end-to-end-platform.test.ts tests/unit/driver-sos-no-os-dialer.test.ts` → exit 0, 3 files / 16 tests (untouched this round).
- `apps/driver-app`: `pnpm exec tsc --noEmit --incremental false -p apps/driver-app/tsconfig.json` → clean.
- `apps/ops-console-web`: `pnpm exec tsc --noEmit --incremental false -p apps/ops-console-web/tsconfig.json` → clean.
- `apps/api`: `pnpm exec tsc --noEmit --incremental false -p apps/api/tsconfig.json` → pre-existing errors in unrelated modules only (`identity`, `multi-taxi/fare-versions`, auth role-union drift, `evidence-governance`, etc. — stale `@drts/contracts` exports/type drift, consistent with every prior round's noted gap); confirmed zero errors reference `driver-sos` or `incident.service`/`incident.repository` (`grep -i "driver-sos\|incident.service\|incident.repository"` on the tsc output was empty).
- `pnpm exec eslint apps/api/src/modules/driver-sos/driver-sos.service.ts apps/api/src/modules/incident/incident.service.ts tests/unit/sos-duty-canonical-ack-and-readback-20261015/duty-ack-race-and-readback.test.ts` → no diagnostics.
- `git diff --check` → clean (no whitespace errors).
- Not run this round: real PostgreSQL CAS/competing-process execution, browser/UI interaction, Android/iOS live device delivery (out of this VM's scope per the dispatch restriction, same as all prior rounds); hosted CI, independent review, and merge/acceptance evidence for this round's new candidate SHA are recorded by the normal candidate lifecycle, not claimed here.

### Original acceptance correspondence (round 7)

| key | evidence/result | pending limits |
| --- | --- | --- |
| sos_canonical_first_ack_current_owner_and_same_event | F1 durability (both sub-findings) now fixed and regression-covered | F2 cross-instance progression (authoritative monotonic status) remains open |
| sos_outbox_handover_and_real_Ops_caller_ACK | foreign-owner and non-fresh-claim convergence now durable/truthful | F5's concurrent-accepted-writer leak on claim rollback remains open |
| sos_native_honest_pending_ack_and_canonical_readback | unchanged this round; blocked by remaining F2 authoritative inconsistency | actual device/background delivery remains original LIVE-DRIVER |
| sos_original_atomic_dedup_offline_auth_render_attachment_regressions | full scoped regression suites pass (175+2 cases); no behavior change to dedup/offline/render/attachment paths | F5 durable leakage remains (different seam, not touched this round) |
| sos_exact_candidate_validation | 2 new meaningful before/after regression cases added this round on top of all prior rounds' cases; scoped lint/tsc/diff checks pass | hosted aggregate checks, approval/protected merge pending the normal candidate lifecycle |
