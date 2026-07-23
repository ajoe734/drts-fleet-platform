# S3-VERIFY-001 Evidence And Blocker Report

## Summary

Current head already contains substantial S-3 implementation. This pass verified the local API, Driver, and Ops acceptance slices that can be honestly exercised in the worker, and recorded the external blockers that remain for full Fleet G closure.

## Verified Locally

### API

- `apps/api/tests/integration/int-s3-001-driver-sos-idempotency.test.ts:225-295`
  verifies:
  - `POST /api/driver/sos-events`
  - spoofed `driverId` is ignored
  - replay keeps one SOS event
  - replay keeps one incident
  - replay keeps one urgent-alert outbox record
  - incident timeline is correlated

- `apps/api/tests/unit/incident.controller.test.ts:20-274`
  verifies current-head Ops incident read models, service-recovery projection, and first-writer-wins assignment conflict behavior.

- `apps/api/tests/unit/ops-dispatch-events.service.test.ts:59-216`
  verifies incident publish and re-emit behavior on the Ops dispatch event stream.

### Driver

- `apps/driver-app/tests/unit/driver-sos-outbox.test.ts:38-168`
  verifies durable local SOS case creation, offline retryable state, supplement queuing, and submit payload shape.

- `apps/driver-app/tests/unit/incident-screen.test.ts:101-224`
  verifies:
  - 2-second confirm gesture before SOS send
  - critical incident creation
  - escalation target update
  - forwarded-task context preservation in payload

- `apps/driver-app/app/incident.tsx:180-216`
  shows the runtime SOS description builder and the current projection fields:
  - source platform
  - mirror order id
  - external order id
  - platform-native status

### Screenshot Runtime Source

- `support/sidecars/DRV-UI-010/DRV-UI-010-VERIFICATION-PACKET.md:71-72`
  identifies the `Incident / SOS` screenshot set.
- `support/sidecars/DRV-UI-010/DRV-UI-010-VERIFICATION-PACKET.md:91-94`
  labels the runtime source as Android native app package `com.cctechsupport.drts.driver` at `1080x1920`.
- `support/sidecars/DRV-UI-010/ui-text-snapshots.md:83-95`
  provides auditable extracted text for the captured incident screen.

## Forbidden-Vocabulary Scan

### Clean on captured incident surface

The forbidden list from the task brief was scanned against:

- `support/sidecars/DRV-UI-010/ui-text-snapshots.md`
- `apps/driver-app/app/incident.tsx`
- `apps/driver-app/tests/unit/incident-screen.test.ts`

No matches were found for:

- `FSD`
- `自駕`
- `Tesla`
- `sandbox`
- `safety operator`
- `external platform badge`

### Residual mismatch outside the incident surface

`forwarded` and `mirror` still appear in current-head driver SOS task-context code and other driver-app snapshots:

- `apps/driver-app/app/incident.tsx:200-206`
- `apps/driver-app/tests/unit/incident-screen.test.ts:219-222`
- `support/sidecars/DRV-UI-010/ui-text-snapshots.md:52`

This means the broad Fleet-G forbidden-vocabulary requirement is not fully green from current local evidence.

## External Or Missing Evidence

### `blocked_ext`: Physical offline replay

The task brief requires real device or simulator evidence for Android and iOS offline replay. This worker has no such execution evidence and must not substitute local mocks.

### `missing_evidence`: Attachment security

Repo scan did not find S-3-specific proof for:

- pre-signed attachment upload
- checksum enforcement
- content-type allowlist
- size-limit rejection
- malware scan
- per-file retry audit

Current-head evidence instead shows only local attachment handling:

- `apps/driver-app/app/sos.tsx:334-361`
  renders attachment rows from local draft state.
- `apps/driver-app/app/sos.tsx:672-761`
  converts `expo-image-picker` assets into draft/supplement attachments and stores them in component state.
- `apps/driver-app/lib/driver-sos-outbox.ts:131-218`
  persists attachment drafts inside the durable SOS active-case record and timeline.
- `apps/driver-app/lib/driver-sos-outbox.ts:208-220`
  builds the submit command without any attachment payload.

That means this worker can verify local attachment drafting exists, but cannot honestly claim S-3 attachment upload, presign, checksum/content-type enforcement, malware scan, or retry-audit verification on current head.

### `blocked_ext`: Production p95

Task brief requires measuring `fleetReportConfirmedAt -> opsAlertRenderedAt` with production-grade evidence. Local Vitest runs and mocked Ops stream timings are not acceptable substitutes.

## Command Record

```bash
pnpm exec vitest run tests/integration/int-s3-001-driver-sos-idempotency.test.ts tests/unit/driver-sos.service.test.ts tests/unit/driver-sos-incident.test.ts --reporter=dot
pnpm exec vitest run tests/unit/incident.controller.test.ts tests/unit/ops-dispatch-events.service.test.ts tests/unit/incident-escalation-service-recovery.test.ts --reporter=dot
```

Executed in `apps/api` on `2026-07-23`: all passed.

```bash
pnpm exec vitest run tests/unit/driver-sos-outbox.test.ts tests/unit/incident-screen.test.ts --reporter=dot
```

Executed in `apps/driver-app` on `2026-07-23`: all passed.
