# S3-VERIFY-001 Sidecar Acceptance Packet

- Parent Task: `S3-VERIFY-001` - Fleet G S-3 production verification
- Sidecar Task: `S3-VERIFY-001-SIDECAR-ACCEPTANCE`
- Owner: `Codex`
- Reviewer: `Gemini`
- Scope: support artifact only; no canonical truth, runtime, contract, or test
  implementation changes

## 1. Objective

Prepare a reviewer-facing acceptance packet for `S3-VERIFY-001` so the parent
owner can close the Fleet G verification gate against a concrete checklist,
dependency map, and code/evidence anchor list.

Primary planning anchors:

- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/06_multi_taxi_runtime_execution_register_20260723.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
- `ai-status.json` slice via `scripts/ai-status.sh show S3-VERIFY-001`

## 2. Machine-Truth Snapshot

### Parent task

`S3-VERIFY-001` is currently `in_progress` with owner `Gemini` and reviewer
`Codex`.

Declared acceptance in machine truth:

- current-head E2E green
- offline replay verified on Android(iOS honest provisional if blocked)
- attachment scan verified
- p95 measured not asserted
- forbidden-vocab scan green
- screenshot evidence labeled with runtime source
- reviewer PASS

Current reviewer reopen message in machine truth:

- Android offline replay is not yet proven on a real device or emulator.
  Linux-only Vitest/unit logs do not satisfy the verification gate.
- The reported p95 value measures in-process enqueue or unit-test latency, not
  the required `fleetReportConfirmedAt -> opsAlertRenderedAt` runtime path.

### Sidecar task

`S3-VERIFY-001-SIDECAR-ACCEPTANCE` is a support-only helper slice with:

- artifact target:
  `support/sidecars/S3-VERIFY-001/S3-VERIFY-001-SIDECAR-ACCEPTANCE.md`
- acceptance:
  - create support artifacts only
  - do not edit canonical truth
  - hand off the packet to the assigned reviewer

## 3. Canonical Verification Summary

Fleet G is a production-verification wave, not a rebuild wave. The planning
docs require the reviewer to verify landed S-3 behavior only:

- current-head API / Driver / Ops E2E
- Android and iOS offline replay
- attachment scanning and upload security
- alert-to-Ops p95 at or below five seconds
- forbidden vocabulary scan plus screenshot evidence

Hard evidence rule from the execution packet:

- physical-device evidence and production-observability evidence cannot be
  replaced by local mocks

`S3-VERIFY-001` is also the dependency gate for:

- `S3-VERIFY-002` Android / iOS offline replay
- `S3-VERIFY-003` attachment scan verification
- `S3-VERIFY-004` p95 <= 5 sec verification
- `S3-VERIFY-005` forbidden vocabulary / projection verification

That means the parent closeout should not claim the Fleet G verification bar is
met while the reopened Android and p95 gaps remain unresolved.

## 4. Spec-To-Code And Evidence Anchors

These repo paths are the most direct reviewer anchors for the landed S-3 flow.
They do not replace runtime evidence, but they show where the implementation
and local harness seams already exist.

- `tests/e2e/E2E-017-driver-sos-incident.sh`
  - current driver-realm E2E seam for SOS submission
  - asserts self-scoped driver submission, correlated incident receipt, and
    driver-realm incident-list denial
- `apps/api/tests/integration/int-s3-001-driver-sos-idempotency.test.ts`
  - integration anchor for idempotent SOS submission and exactly-one
    correlated incident / outbox record
- `apps/api/src/modules/driver-sos/driver-sos.service.ts`
  - server-side incident creation, outbox emission, and persistence handoff
- `apps/driver-app/lib/driver-sos-outbox.ts`
  - offline-capable durable outbox and retry state for driver SOS reporting
- `apps/ops-console-web/lib/sos-view-model.ts`
  - Ops-side SOS queue / detail projection surface

Reviewer expectation:

- local tests may prove contract and wiring health
- they do not by themselves satisfy Android emulator/device replay evidence
- they do not by themselves satisfy runtime p95 measurement or screenshot
  provenance

## 5. Dependency Map

### Upstream runtime foundations

- `S3-BE-001`
  - landed SOS backend
  - required for incident creation, event numbers, and urgent-alert outbox flow
- `S3-UI-DRIVER-001`
  - landed driver SOS UI / outbox surface
  - required for offline replay verification
- `S3-UI-OPS-001`
  - landed Ops board / detail surface
  - required for alert rendering, first-ack wins, resolve, and close evidence

### Direct downstream verification slices

- `S3-VERIFY-002`
  - depends on `S3-VERIFY-001`
  - mobile QA proof for Android / iOS offline replay
- `S3-VERIFY-003`
  - depends on `S3-VERIFY-001`
  - security/API proof for attachment scan, checksum, content-type allowlist,
    size limits, malware scan, audit, and per-file retry
- `S3-VERIFY-004`
  - depends on `S3-VERIFY-001`
  - observability proof for `fleetReportConfirmedAt -> opsAlertRenderedAt` p95
- `S3-VERIFY-005`
  - depends on `S3-VERIFY-001`
  - CI / UI QA proof for forbidden vocabulary and screenshot labeling

### Cross-slice review implication

`S3-VERIFY-001` is the gate review slice. It should aggregate or explicitly
reference the downstream evidence above, but it must not absorb unsupported
claims from local-only mocks, unit tests, or unlabeled screenshots.

## 6. Reviewer Checklist

- [ ] Current-head E2E evidence shows the full landed path: create SOS,
      exactly one incident, event number, outbox emission, Ops stream, first
      acknowledgement wins, then resolve / close.
- [ ] Evidence is tied to current head rather than an older detached artifact.
- [ ] Android offline replay is proven on a real device or emulator; otherwise
      the parent task honestly records `blocked_ext` or equivalent non-pass
      status instead of claiming verification.
- [ ] iOS evidence is either proven or honestly marked provisional / blocked
      per machine-truth acceptance wording.
- [ ] Attachment verification includes actual scan/security-path evidence, not
      only static code inspection.
- [ ] p95 evidence measures the required
      `fleetReportConfirmedAt -> opsAlertRenderedAt` runtime path.
- [ ] Reported latency is measured, not merely asserted from unit or in-process
      timings.
- [ ] Forbidden vocabulary scan is green for driver and Ops SOS projections.
- [ ] Screenshots are labeled with runtime source so reviewer can distinguish
      emulator, device, local browser, and production-observability evidence.
- [ ] Reviewer packet and parent closeout do not present local mock or unit
      proof as production verification.

## 7. Handoff Notes For Parent Owner / Reviewer

- Treat this packet as a support checklist, not new product truth.
- The current reopen message already identifies the two blocking gaps that
  matter most for re-review: Android offline replay evidence and true runtime
  p95 evidence.
- If those two gaps remain unresolved, the task should stay open or be marked
  with an honest external blocker rather than forced to PASS.
- The parent slice may cite local E2E / integration anchors for code-path
  confidence, but Fleet G closeout still needs runtime-labeled evidence across
  Driver, API, and Ops surfaces.

## 8. Evidence Index

- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/06_multi_taxi_runtime_execution_register_20260723.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/07_fleets_execution_tasks_20260723.md`
- `tests/e2e/E2E-017-driver-sos-incident.sh`
- `apps/api/tests/integration/int-s3-001-driver-sos-idempotency.test.ts`
- `apps/api/src/modules/driver-sos/driver-sos.service.ts`
- `apps/driver-app/lib/driver-sos-outbox.ts`
- `apps/ops-console-web/lib/sos-view-model.ts`
