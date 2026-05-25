# UI-BE-002 Acceptance Packet & Dependency Map

Snapshot Type: closeout refresh from `ai-status.json`  
Snapshot Captured At: `2026-05-25T16:57:47Z`  
Snapshot Status At Capture: parent=`review`; sidecar=`review_approved`  
Sidecar Owner: `Codex`  
Sidecar Reviewer: `Claude2`  
Parent Task: `UI-BE-002`  
Parent Title: `UiHealthEnvelope on /api/health + degraded-service taxonomy`  
Parent Owner: `Gemini2`  
Parent Reviewer: `Codex`

## Purpose

This packet is a support-only acceptance companion for `UI-BE-002`. The
parent task is now in `review`, so this document remains a reviewer
scaffold: it captures the acceptance checklist, dependency map, and
baseline evidence anchors that should be compared against the parent diff.

Live lifecycle truth remains authoritative only in `ai-status.json`.
This markdown file does not replace parent machine truth and does not
modify runtime code, contracts, or canonical planning documents.

## Scope Boundary

Allowed:

- create a reviewer-facing packet for the `/api/health` contract change
- identify the current route wiring, contract export points, test seams,
  and downstream consumers impacted by the change
- record machine-truth and planning anchors for the assigned reviewer

Not allowed:

- editing `apps/api/src/**`, `packages/contracts/**`, `packages/api-client/**`,
  frontend runtime code, or any canonical truth document
- changing the parent task row or sidecar row directly outside the normal
  `scripts/ai-status.sh` lifecycle
- pre-approving the future parent diff

## Machine-Truth Snapshot

- `ai-status.json` records parent task `UI-BE-002` as `review` with
  acceptance: `/api/health returns UiHealthEnvelope shape; per-dependency degradedServices[]; vitest covers 3 states`.
- `ai-status.json` records sidecar task `UI-BE-002-SIDECAR-ACCEPTANCE` as
  `review_approved`; reviewer `Claude2` confirmed the packet is
  support-only, accurately anchored, and ready for the parent
  owner/reviewer.
- The current parent task row lists artifact path
  `apps/api/src/modules/health/`, but the live endpoint currently sits in
  `apps/api/src/health/`. Reviewer spot-checks should follow the real
  route wiring, not only the task-row folder label.

## Planning And Contract Anchors

- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:71`
  defines parent acceptance for `UI-BE-002`.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:88`
  marks `UI-CL-001` as the direct typed downstream dependency on
  `UiHealthEnvelope`.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:102`
  records `UI-FE-ADM` as a later frontend consumer that depends on
  `UI-BE-002`.
- `docs/05-ui/system-design-answers-all-apps-20260524.md:320-336`
  defines the intended `UiHealthEnvelope` shape and explicitly rejects
  silent `try/catch -> []` fallback.
- `packages/contracts/src/ui-runtime.ts:53-75` already defines the shipped
  `UiHealthEnvelope` and `UiHealthDegradedService` interfaces.
- `packages/contracts/src/index.ts:4920-4922` already re-exports
  `ui-runtime`, so the parent task should emit an existing contract
  rather than invent a new local type.

## Current Runtime Baseline

- `apps/api/src/health/health.controller.ts:6-22` currently returns an old
  payload with fields `service`, `status`, `mode`, `execution_mode`, and
  `timestamp`.
- `apps/api/src/main.ts:16-27` manually mounts `/api/health` and reuses
  `buildHealthPayload()`, so controller behavior and manual route
  behavior must stay aligned.
- `apps/api/src/app.module.ts:21-21,46-52` wires `HealthModule` from
  `apps/api/src/health/`, not `apps/api/src/modules/health/`.
- `apps/api/src/common/auth/internal-key.middleware.ts:19-20,53-58,107-115`
  treats `/health` and `/api/health` as public internal-key exemptions.
- `apps/api/tests/unit/auth-bootstrap.test.ts:657-669` and
  `apps/api/tests/unit/feature-gate.guard.test.ts:91-100` currently verify
  access-control bypass behavior for `/api/health`, but they do not cover
  the response envelope shape.
- `apps/ops-console-web/app/dashboard/page.tsx:45-52,513-523,654-661`
  still consumes the old `HealthPayload` fields for subtitle rendering.
  `apps/ops-console-web/app/dashboard/page.tsx:338-349,733-736` already
  tolerates both `ok` and `healthy/degraded/down` for tone mapping, but
  the old `timestamp/mode/execution_mode` fields remain a live consumer
  dependency until downstream work lands.

## Packet Integrity Checklist

- [x] Packet is limited to support material for `UI-BE-002`.
- [x] Dependency map is anchored to the repo's current `/api/health`
  implementation seams.
- [x] Reviewer guidance calls out both the route path mismatch and the
  downstream consumer impact.
- [x] No canonical truth or runtime implementation file is changed by this
  sidecar slice.

## Parent Reviewer Checklist

- [ ] `/api/health` returns the `UiHealthEnvelope` contract shape anchored
  in `packages/contracts/src/ui-runtime.ts`.
- [ ] `degradedServices[]` contains explicit per-dependency records with
  `service`, `impact`, and `severity`, not a generic string blob.
- [ ] The implementation keeps one source of truth for `/health` and
  `/api/health` so the controller path and manual route do not drift.
- [ ] Public-route behavior is preserved: health remains internal-key
  exempt and does not accidentally become feature-gated.
- [ ] New vitest coverage explicitly asserts `healthy`, `degraded`, and
  `down` payload states; existing auth/gate bypass tests are not counted
  as sufficient acceptance coverage.
- [ ] The parent diff either updates downstream consumers in scope or
  explicitly documents why the remaining old-field consumer path is left
  to `UI-CL-001` or later frontend follow-up.

## Dependency Map

### 1. Route and module wiring

- `apps/api/src/health/health.controller.ts:6-22`
  Current payload builder and controller entrypoint for `/health`.
- `apps/api/src/health/health.module.ts:1-8`
  Health controller module wrapper.
- `apps/api/src/app.module.ts:21-21,46-52`
  Registers `HealthModule` in the API app.
- `apps/api/src/main.ts:16-27`
  Manually exposes `/api/health` and reuses `buildHealthPayload()`.

### 2. Access-control and public-route invariants

- `apps/api/src/common/auth/internal-key.middleware.ts:19-20,53-58,107-115`
  Public-route exemption logic for `/health` and `/api/health`.
- `apps/api/tests/unit/auth-bootstrap.test.ts:657-669`
  Regression guard for the internal-key bypass.
- `apps/api/tests/unit/feature-gate.guard.test.ts:91-100`
  Regression guard that undecorated `/api/health` is not feature-gated.

### 3. Contract surface

- `packages/contracts/src/ui-runtime.ts:53-75`
  Canonical TypeScript shape for `UiHealthEnvelope` and
  `UiHealthDegradedService`.
- `packages/contracts/src/index.ts:4920-4922`
  Public export surface consumed by downstream packages.

### 4. Current consumer and downstream sequencing

- `apps/ops-console-web/app/dashboard/page.tsx:45-52`
  Defines the current old `HealthPayload` local type.
- `apps/ops-console-web/app/dashboard/page.tsx:513-523`
  Fetches `/api/health` directly.
- `apps/ops-console-web/app/dashboard/page.tsx:654-661`
  Uses old subtitle fields `timestamp`, `mode`, and `execution_mode`.
- `apps/ops-console-web/app/dashboard/page.tsx:338-349,733-736`
  Already maps `ok` and `healthy/degraded/down` to UI tones.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:88,115`
  Direct downstream: `UI-CL-001`.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:102`
  Later frontend dependency: `UI-FE-ADM`.

## Reviewer Notes

- The most important structural risk is duplicated route logic:
  `buildHealthPayload()` currently feeds both the controller and the
  manual `/api/health` route. A parent diff that updates only one path is
  incomplete.
- The most important integration risk is not the health-status enum; the
  current ops dashboard already tolerates `ok` and `healthy/degraded/down`
  for tone mapping. The real remaining consumer risk is removal of
  `timestamp`, `mode`, and `execution_mode` without the planned
  downstream adaptation.
- Because this packet is support-only and anchored to the pre-merge
  baseline on this branch, it should be read as a review scaffold against
  the parent diff, not as evidence that parent acceptance is already met
  on `dev`.

## Evidence Index

- `/home/edna/workspace/drts-fleet-platform/ai-status.json:20907-20922`
  Parent task row for `UI-BE-002`.
- `/home/edna/workspace/drts-fleet-platform/ai-status.json:23106-23129`
  Sidecar task row for `UI-BE-002-SIDECAR-ACCEPTANCE`.
- `/home/edna/workspace/drts-fleet-platform/ai-status.json:184359-184374`
  Parent review handoff and sidecar approval inbox entries.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:71-71`
  Parent acceptance row.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:88-88`
  Downstream `UI-CL-001` dependency row.
- `docs/03-runbooks/phase1-ui-implementation-wave-planning-20260525.md:102-102`
  `UI-FE-ADM` dependency row.
- `docs/05-ui/system-design-answers-all-apps-20260524.md:320-336`
  `UiHealthEnvelope` contract rationale.
- `apps/api/src/health/health.controller.ts:6-22`
  Current old payload builder.
- `apps/api/src/main.ts:16-27`
  Manual `/api/health` route registration.
- `apps/api/src/common/auth/internal-key.middleware.ts:19-20,53-58,107-115`
  Health path public-route handling.
- `packages/contracts/src/ui-runtime.ts:53-75`
  Existing shared contract definition.
- `apps/ops-console-web/app/dashboard/page.tsx:45-52,513-523,654-661,733-736`
  Current consumer expectations.

## Recorded Review Trail

- `2026-05-25T16:11:18Z`: `Codex` handed the packet off with sidecar-only
  verification and no canonical/runtime file changes.
- `2026-05-25T16:46:20Z`: the reviewer lane was reassigned from `Gemini`
  to `Claude2` after the original reviewer lane paused.
- `2026-05-25T16:57:47Z`: `Claude2` approved the packet after spot-checking
  every listed anchor and confirming the checklist correctly highlights
  both route-drift risk and downstream consumer impact.

## Local Verification For This Sidecar Slice

- Confirm only `support/sidecars/UI-BE-002/UI-BE-002-SIDECAR-ACCEPTANCE.md`
  was added for this task.
- Run
  `git diff --check -- support/sidecars/UI-BE-002/UI-BE-002-SIDECAR-ACCEPTANCE.md`.
- Spot-check the machine-truth and code anchors listed in the evidence
  index before approving the sidecar.
