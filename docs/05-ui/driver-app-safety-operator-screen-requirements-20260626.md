# Driver App - Safety Operator Mode (Implementation Supplement)

**Date:** 2026-06-26
**Feature:** Driver App Safety Operator realm: `SOFrame` / `SOModeBar` / `SOSyncStrip` + `SO_Provisioning` / `SO_ShiftStart` / `SO_VehicleAssign` / `SO_Pretrip` / `SO_ActiveTrip` / `SO_TakeoverReport` / `SO_IncidentUpload` / `SO_TripCloseout` / `SO_ShiftHandover`
**Recipient team:** Parent implementation / publication-routing lanes
**Status:** Canonical canvas authored upstream at `origin/phase2-tesla-sandbox-docs-20260625@67113d786`, but not yet published to `dev`. This note is a non-visual implementation supplement only. **No visual decisions in this document.**
**Author lane:** Codex
**Authority:**
[`phase1_prd_detailed_v1.md` §15.3 / §16.2](../../phase1_prd_detailed_v1.md) ·
[`phase1_system_analysis_v1.md` §3.2 / §14.2](../../phase1_system_analysis_v1.md) ·
[`packages/contracts/src/phase2-tesla-fsd-sandbox.ts` §3.5](../../packages/contracts/src/phase2-tesla-fsd-sandbox.ts) ·
[`apps/api/src/modules/safety-operator/safety-operator.service.ts`](../../apps/api/src/modules/safety-operator/safety-operator.service.ts) ·
[`apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts`](../../apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts)
**Visual authority:** `docs/05-ui/drts-design-canvas/driver-safety-operator.jsx` at `origin/phase2-tesla-sandbox-docs-20260625@67113d786` (pending publication to `dev`). Existing general-driver canvases remain useful only as shared primitive references, not as safety-operator screen authority.

> `driver-safety-operator.jsx` already exists upstream and is the binding screen authority for this feature. The current `dev` worktree lacks it only because the canvas wave is not yet published there. This note must not override that canvas or be used to invent a fallback UI.

## 1. Why this packet exists

`P2-UI-SAFE-001` asks `apps/driver-app` to add a Safety Operator realm that is
separate from the normal driver mode and covers:

- offline queue + unsynced indicator
- takeover report idempotency via `clientGeneratedReportId`
- editable takeover event time with original system time and edit audit preserved
- no Tesla / FSD control UI
- i18n-ready copy

The canonical Safety Operator canvas is already authored upstream, but `dev`
does not yet contain that docs wave. This packet therefore records only the
non-visual behavior, data, and contract-routing constraints that the parent
implementation must preserve once the canvas is published to `dev`.

## 2. Persona and context

Persona: `safety_operator`.

Context: Tesla / AV sandbox overlay for Phase 2, not a relabeled `driver`
screen set.

Non-visual rules:

- Safety Operator is a separate mode / realm, not a copy of the general driver
  shell with renamed labels.
- The app may show assignment, trip, takeover, incident, evidence, and handover
  context only. It must **not** expose Tesla / FSD remote commands, control
  toggles, resume buttons, or other vehicle-control affordances.
- Any offline-capable safety-operator write must use a durable queue and must
  surface unsynced state honestly.

## 3. Screen scope

The upstream canvas defines the shell / screen set below. If this note groups
behavior more coarsely, the published canvas still wins for screen split and IA:

- `SOFrame`
- `SOModeBar`
- `SOSyncStrip`
- `SO_Provisioning`
- `SO_ShiftStart`
- `SO_VehicleAssign`
- `SO_Pretrip`
- `SO_ActiveTrip`
- `SO_TakeoverReport`
- `SO_IncidentUpload`
- `SO_TripCloseout`
- `SO_ShiftHandover`

## 4. Shared behavioral requirements

### 4.1 Realm separation

- Safety Operator mode and normal driver mode must have separate entry, header
  copy, navigation context, and state persistence.
- If one device has both general-driver and safety-operator authority, switching
  modes must not mix current shift, assignment, or pending queue state.

### 4.2 Offline queue and unsynced disclosure

- Safety Operator writes include at least: pre-trip checklist, takeover report,
  incident/evidence metadata, and shift handover / trip closeout.
- The queue must be durable, not memory-only.
- The UI must continuously expose `pending` / `syncing` / `failed` / `synced`
  states.
- `SOSyncStrip` must carry queue depth, last successful sync time, and retry
  failure state. This note does not define its layout.

### 4.3 `clientGeneratedReportId` dedupe

- Takeover reports must use `clientGeneratedReportId` for idempotency.
- Offline replay or retry must not overwrite the first accepted report body.
- The UI must distinguish:
  - local pending item not yet accepted by server
  - duplicate replay where server already accepted the first report

### 4.4 `occurredAt` routing for this wave

The upstream `SO_TakeoverReport` canvas requires three distinct concepts during
draft capture:

- the currently editable takeover time shown to the operator
- the original system-captured takeover time shown separately
- an audit trail for each time correction before first submit

The current backend contract still persists only a single submitted
`occurredAt` plus `serverReceivedAt`:

- the canonical write surface is `SubmitSafetyOperatorTakeoverReportCommand`
- the persisted record is `SafetyOperatorTakeoverReport`
- there is no PATCH / PUT mutation for takeover reports in the current contract
- once a report for the same `clientGeneratedReportId` is accepted, duplicate
  replays return the original report / receipt and must not overwrite
  `occurredAt` or other payload fields

For `P2-UI-SAFE-001`, this means:

- the parent must **not** collapse the takeover-report entry flow to a single
  immutable timestamp field at the UI layer
- the UI draft / offline queue must preserve the original system-captured time
  and the pre-submit correction audit needed by the canvas
- first submit still sends only the corrected `occurredAt` through the current
  backend contract
- after first acceptance, the synced report remains immutable in this wave's
  backend/API contract

Server-persisted original-system-time or correction-history data is **not**
available in the current contract. If product needs that information to survive
submission / replay / later readback outside the local draft lifecycle, that is
a separate contracts/backend follow-up before the UI may claim that capability
in synced/read surfaces.

### 4.5 No FSD control UI

- The UI must not show vehicle remote command, FSD enable / disable,
  autopilot-resume, horn / light / door, or similar control surfaces.
- If `fsdResumed` appears, it is event/result data only, not a control.

## 5. Surface requirements

### 5.1 `SO_Provisioning`

Purpose: confirm safety-operator identity, qualification, assignment,
device/vehicle binding, and sandbox context.

Required data / state:

- `safetyOperatorId`
- `sandboxProgramId`
- `deviceId`
- `vehicleId`
- `assignmentId`
- `qualified`
- `matchedQualificationIds`
- `reasons`
- `activeAssignmentId`

Behavior:

- If qualification, device binding, or assignment ownership fails, the user may
  not continue to active-trip flow.
- This is a safety-operator entry surface, not the existing driver onboarding
  screen with new copy.

### 5.2 `SO_Pretrip`

Purpose: submit the safety-operator pre-trip checklist.

Checklist items:

- `vehicle_exterior`
- `cab_cleanliness`
- `seatbelts`
- `brakes`
- `lights`
- `tires`
- `mirrors`
- `recorder_health`
- `autonomy_stack`
- `fallback_comms`

Each item needs:

- `pass` / `fail` / `na`
- optional note

Also required:

- `blockerCodes`
- `notes`
- `allPassed`
- `completedAt`

### 5.3 `SO_ActiveTrip`

Purpose: the main active-trip / active-shift surface for the safety operator.

Minimum context:

- current `shiftId`
- current `assignmentId`
- `vehicleId`
- `orderId`
- queue / unsynced state via `SOSyncStrip`
- most recent sync result
- count of unsynced checklist / takeover / incident / closeout items

This screen must host the takeover-report flow.

#### Takeover report requirements

Required fields:

- `clientGeneratedReportId`
- `correlationId`
- `safetyOperatorId`
- `vehicleId`
- `orderId`
- `sandboxProgramId`
- `shiftId`
- `assignmentId`
- `trigger`
- `reasonCode`
- `disposition`
- `fsdResumed`
- `bookmarkId`
- `incidentId`
- `evidenceArtifactIds`
- `notes`
- `occurredAt`

Behavior:

- On success the UI must show server receipt data:
  `reportId` / `serverReceivedAt` / duplicate state.
- Offline submit may queue locally first.
- When replay succeeds, the local pending item must merge into the accepted
  server record instead of appearing as a second report.
- The dedicated `SO_TakeoverReport` capture flow must preserve the original
  system-captured time and local correction audit until first acceptance.
- After first acceptance, `occurredAt` is displayed as submitted data, not a
  mutable post-submit field.

### 5.4 `SO_IncidentUpload`

Purpose: attach incident and evidence metadata to the current safety-operator
workflow.

Minimum support:

- `incidentId`
- `bookmarkId`
- `evidenceArtifactIds`
- linkage state to current takeover / closeout
- offline pending and sync-failure status

This screen handles reporting/evidence linkage only. It does not expose Tesla /
FSD controls.

### 5.5 `SO_ShiftHandover`

Purpose: end the shift, hand off the trip, or record trip closeout.

Closeout states:

- `completed`
- `handoff`
- `incident_escalated`
- `cancelled`

Required data:

- `closeoutAt`
- `takeoverReportIds`
- `incidentId`
- `evidenceArtifactIds`
- `notes`
- `endedAt`
- `endLocation`

This surface must clearly distinguish:

- single-trip closeout
- entire shift end
- handoff to another operator / ROC

## 6. Implementation preconditions still missing on `dev`

These gaps still block direct UI implementation:

1. Safety-operator canvas publication to `dev`
   `driver-safety-operator.jsx` already exists at
   `origin/phase2-tesla-sandbox-docs-20260625@67113d786`, including
   `SOFrame`, `SOModeBar`, `SOSyncStrip`, and `SO_TakeoverReport`. The parent
   task cannot implement against that authority until the docs wave is
   published or otherwise replayed onto `dev`.

2. Realm token and shell mapping stop at general `driver`
   `packages/ui-tokens/src/realms.ts` defines `tenant` / `ops` / `platform` /
   `system` / `driver` only. `apps/driver-app/app/_layout.tsx`,
   `apps/driver-app/lib/theme.ts`, and `apps/driver-app/lib/strings.ts` are
   still wired around the general driver shell and route model.

3. Driver-app still lacks safety-operator client / namespace wiring
   `apps/driver-app/lib/api-client.ts` and current local persistence keys are
   still `drts.driver.*`. Safety-operator-specific client helpers, queue
   namespace, and session storage still need implementation after visual
   authority lands.

4. Synced correction-history persistence is a separate follow-up if needed
   The parent can implement the canvas capture flow by preserving original
   system time + correction audit in local draft state and submitting the final
   `occurredAt` through the current contract. If product later requires that
   original-system-time or correction-history data to survive submission and be
   queryable from synced records, that would require a new backend/contracts
   follow-up.

## 7. Publication / integration routing

- The blocker for `P2-UI-SAFE-001` is no longer "missing design"; it is
  publication / integration of the existing Safety Operator canvas into `dev`.
- Parent implementation must resume against the published
  `driver-safety-operator.jsx` screen map and component names, not against the
  older general-driver canvases or this note's earlier fallback assumptions.
- Any future visual drift must be resolved by updating the canonical canvas, not
  by extending this note with substitute layouts.

## 8. Out of scope for this note

- RN / Expo runtime implementation
- SQLite / SecureStore / queue-engine details
- concrete `/api/safety-operator/*` client-helper code
- Tesla / FSD / vehicle-command UI
- visual layout, color, icon, type, or spacing decisions
