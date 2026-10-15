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
