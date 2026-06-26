# Driver App - Safety Operator Mode (Design Hand-off)

**Date:** 2026-06-26
**Feature:** Driver App Safety Operator realm: `SOFrame` / `SOModeBar` / `SOSyncStrip` + `SO_Provisioning` / `SO_Pretrip` / `SO_ActiveTrip` / `SO_IncidentUpload` / `SO_ShiftHandover`
**Recipient team:** Visual design team (including UX)
**Status:** Blocked by missing canvas. Hand-off input only. **No visual decisions in this document.**
**Author lane:** Codex
**Authority:**
[`phase1_prd_detailed_v1.md` §15.3 / §16.2](../../phase1_prd_detailed_v1.md) ·
[`phase1_system_analysis_v1.md` §3.2 / §14.2](../../phase1_system_analysis_v1.md) ·
[`packages/contracts/src/phase2-tesla-fsd-sandbox.ts` §3.5](../../packages/contracts/src/phase2-tesla-fsd-sandbox.ts) ·
[`apps/api/src/modules/safety-operator/safety-operator.service.ts`](../../apps/api/src/modules/safety-operator/safety-operator.service.ts) ·
[`apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts`](../../apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts)
**Visual authority (existing look / IA only; insufficient to complete this feature):** `docs/05-ui/driver-app-design-20260507/driver-screens-1.jsx`, `driver-screens-2.jsx`, `driver-screens-3.jsx`, `design-canvas.jsx`, `components.jsx`, `tokens.jsx`, `DRTS Driver App.html`

> The repo currently has **no** `driver-safety-operator.jsx` or equivalent safety-operator canvas. Per the task UI design contract, when the screen truth is missing the correct stop point is a screen-requirements note, not an engineer-invented UI.

## 1. Why this packet exists

`P2-UI-SAFE-001` asks `apps/driver-app` to add a Safety Operator realm that is
separate from the normal driver mode and covers:

- offline queue + unsynced indicator
- takeover report idempotency via `clientGeneratedReportId`
- editable takeover event time with audit preserved
- no Tesla / FSD control UI
- i18n-ready copy

The current Driver App canvas only covers the general driver workspace and does
not define `SOFrame`, `SOModeBar`, `SOSyncStrip`, or any safety-operator-only
screens. This packet records the required behavior, data, and boundaries so the
visual design team can produce the canonical canvas.

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

This feature's intended shell / screen set is:

- `SOFrame`
- `SOModeBar`
- `SOSyncStrip`
- `SO_Provisioning`
- `SO_Pretrip`
- `SO_ActiveTrip`
- `SO_IncidentUpload`
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

### 4.4 `occurredAt` planning decision for this wave

The canonical takeover-time contract for this wave is **submit-only and
immutable after first acceptance**.

- The UI may prefill `occurredAt` from a device-captured suggestion and let the
  operator adjust it **before** the first submit.
- The canonical write surface is the single `occurredAt` field on
  `SubmitSafetyOperatorTakeoverReportCommand`.
- The persisted record is `SafetyOperatorTakeoverReport`, which stores
  `occurredAt` plus `serverReceivedAt`.
- There is no PATCH / PUT mutation for takeover reports in the current contract.
- Once a report for the same `clientGeneratedReportId` is accepted, duplicate
  replays return the original report / receipt and must not overwrite
  `occurredAt` or other payload fields.

For `P2-UI-SAFE-001`, this means:

- expose editable `occurredAt` only during initial report entry
- show the submitted event time and server receipt after submission
- do **not** invent post-submit correction controls
- do **not** invent extra contract fields such as `originalOccurredAt`,
  `editedOccurredAt`, or `editReason`

If product later wants post-submit correction history or explicit original vs.
corrected-time rendering, that is a separate contracts/backend follow-up before
the UI may claim it.

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

## 6. Implementation preconditions still missing in repo

These gaps still block direct UI implementation:

1. Missing safety-operator canvas
   The repo still has no `driver-safety-operator.jsx`, `SOFrame`,
   `SOModeBar`, `SOSyncStrip`, or equivalent screen authority under
   `docs/05-ui/drts-design-canvas/`.

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

4. Post-submit takeover-time correction is intentionally out of scope
   This is not a blocker for the parent. The current wave uses the immutable
   submit-only contract above. A later product request for correction history or
   explicit edit-reason fields would require a new backend/contracts follow-up.

## 7. Purely visual open questions for design

- VQ-1 Does `SOFrame` reuse the phone chrome shape from the general Driver App,
  or does Safety Operator need distinct header / nav chrome?
- VQ-2 How should `SOModeBar` make the safety-operator realm unmistakable
  without implying vehicle-control authority?
- VQ-3 How should `SOSyncStrip` show queue depth, duplicate receipt, and failed
  sync state without making operators misread submission status?
- VQ-4 How should the submitted `occurredAt` and `serverReceivedAt` be shown in
  active-trip / report-review states?
- VQ-5 How should `SO_ShiftHandover` distinguish trip closeout, shift end, and
  handoff intent?

## 8. Out of scope for this note

- RN / Expo runtime implementation
- SQLite / SecureStore / queue-engine details
- concrete `/api/safety-operator/*` client-helper code
- Tesla / FSD / vehicle-command UI
- visual layout, color, icon, type, or spacing decisions
