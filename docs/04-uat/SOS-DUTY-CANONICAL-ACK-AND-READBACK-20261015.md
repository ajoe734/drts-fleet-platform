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
