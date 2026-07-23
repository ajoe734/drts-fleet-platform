# MTX-CORE-001 SIDECAR ACCEPTANCE PACKET

- Parent Task: `MTX-CORE-001` - Fleet A runtime authority
- Sidecar Task: `MTX-CORE-001-SIDECAR-ACCEPTANCE`
- Owner: `Gemini`
- Reviewer: `Codex`
- Scope: Support artifact only; no canonical truth or runtime implementation changes

---

## 1. Objective

Prepare an authoritative reviewer-facing acceptance packet and dependency map for `MTX-CORE-001` (Fleet A runtime authority). This support packet enables the parent task owner (`Codex`) and reviewer (`Gemini`) to execute and review against a concrete acceptance checklist, dependency map, and spec-to-code anchor list.

Primary source anchors:

- [06_multi_taxi_runtime_execution_register_20260723.md](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-core-001-sidecar-acceptance/docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/06_multi_taxi_runtime_execution_register_20260723.md)
- [03_gap_closure_implementation_plan.md](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-core-001-sidecar-acceptance/docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md)
- [phase1_prd_detailed_v1.md](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-core-001-sidecar-acceptance/phase1_prd_detailed_v1.md)
- [phase1_service_contracts_v1.md](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-core-001-sidecar-acceptance/phase1_service_contracts_v1.md)
- [phase1-p5-s3-multi-taxi.ts](file:///home/edna/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-mtx-core-001-sidecar-acceptance/packages/contracts/src/phase1-p5-s3-multi-taxi.ts)

---

## 2. Canonical Acceptance Summary

From the multi-taxi runtime execution register and gap closure implementation plan, `MTX-CORE-001` must deliver:

- Server-authoritative profile resolution for Fleet A multi-taxi orders (`runtimeProfileCode="multi_taxi_direct"`, `serviceProductCode="taxi_reservation"`, `acquisitionMode="platform_reserved"`).
- Fail-closed intake guards rejecting client-spoofed profile/acquisition fields.
- Explicit denial of illegal acquisition modes (`street_hail` denied, `physical_rank` denied).
- Removal of `: any` return type annotations on touched dispatch entrypoints in `owned-mobility`.
- End-to-end integration proof covering persisted passenger access tokens, order readback after restart, and virtual queue enforcement.

Expected verification for the parent task slice:

```bash
pnpm --filter @drts/api exec vitest run \
  tests/unit/owned-mobility.service.test.ts \
  tests/unit/multi-taxi.service.test.ts \
  tests/unit/multi-taxi.repository.test.ts \
  tests/integration/int-mtx-001-runtime-authority.test.ts
```

Targeted reviewer spot-checks against implementation code:

- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `apps/api/tests/unit/multi-taxi.service.test.ts`
- `apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts`
- `support/sidecars/MTX-CORE-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/MTX-CORE-001/MTX-CORE-001-ACCEPTANCE.md`

---

## 3. Required Canonical Runtime Context Fields

Every multi-taxi order created in Fleet A must have server-authored runtime fields populated and immutable from public intake:

- `runtimeProfileCode`: `"multi_taxi_direct"`
- `acquisitionMode`: `"platform_reserved"`
- `timingMode`: `"on_demand"` | `"scheduled"`
- `serviceProductCode`: `"taxi_reservation"`
- `operatingAuthorizationId`: resolved server-side from active vehicle/authorization mapping
- `queueMode`: `"virtual_matching"` (non-virtual queue modes strictly disallowed for multi-taxi)

Public intake payloads attempting to supply or override any of these fields directly must be rejected fail-closed.

---

## 4. Spec-To-Code Anchor Map

Live code and branch implementation (`codex/mtx-core-001`, commit `e767f8b53980`) establish the following contract and runtime seams:

- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
  - Defines `RuntimeProfileCode`, `AcquisitionMode`, `OperatingAuthorization`, `MultiTaxiOrderContext`, and enum constraints for Fleet A multi-taxi runtime authority.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
  - Implements server-authored multi-taxi order creation with fail-closed override guards for client-supplied context.
  - Replaces `: any` return annotations with explicit types on touched assignment and dispatch methods.
- `apps/api/src/modules/service-product/service-product.service.ts`
  - Enforces runtime-profile service-product activation via `assertRuntimeProfileServiceProductActive(...)`.
- `apps/api/tests/unit/owned-mobility.service.test.ts`
  - Unit tests for multi-taxi order creation, profile header resolution, and rejection of spoofed `street_hail` / `physical_rank` context overrides.
- `apps/api/tests/unit/multi-taxi.service.test.ts`
  - Unit coverage for multi-taxi profile resolution, passenger intake validation, and failure modes.
- `apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts`
  - Integration suite verifying on-demand & scheduled `platform_reserved` pass, passenger ride access token persistence, order readback across restart, and non-virtual queue rejection.
- `support/sidecars/MTX-CORE-001/CURRENT-HEAD-PREFLIGHT.md`
  - Records scope preflight check, existing code reuse decisions, and gap analysis.
- `support/sidecars/MTX-CORE-001/MTX-CORE-001-ACCEPTANCE.md`
  - Implementation evidence summary prepared by parent task owner `Codex`.

---

## 5. Dependency Map

```text
MTX-CORE-001 (Fleet A Runtime Authority)
├── MTX-CORE-002 (Dedicated Passenger & Call-Center Intake)
├── MTX-CORE-003 (Remove Invalid Subtype Guard)
├── MTX-CORE-004 (Profile-Scoped Service-Product Activation)
├── MTX-CORE-005 (Server-Authoritative Profile Resolver)
├── MTX-AUTH-001 (Authorization + Vehicle Membership Tables)
├── MTX-QUEUE-001 (QueueMode Contracts & Persistence)
├── P5-RATE-001 (Rating Event / Summary)
└── MTX-CORE-QA-001 (On-demand + Scheduled Intake E2E)
```

### Upstream Dependencies

- **None** in machine truth (`MTX-CORE-001` is the foundational Wave 0 task for Fleet A runtime authority).

### Direct Downstream Tasks

- `MTX-CORE-002`: Dedicated passenger (`POST /api/multi-taxi/rides`) and call-center (`POST /api/call-center/multi-taxi/rides`) intake routes depend on `MTX-CORE-001` server-authored context resolution.
- `MTX-CORE-003`: Refactoring/removing invalid subtype guards depends on `MTX-CORE-001` typed context models.
- `MTX-CORE-004`: Service product activation policies depend on `MTX-CORE-001` runtime profile codes.
- `MTX-CORE-005`: Profile resolver relies on `MTX-CORE-001` runtime authority bounds.
- `MTX-AUTH-001`: Authorization and vehicle membership persistence depend on `MTX-CORE-001` context structures.
- `MTX-QUEUE-001`: QueueMode persistence and policy rely on `MTX-CORE-001` virtual queue constraints.
- `P5-RATE-001`: Rating authority depends on `MTX-CORE-001` order context.
- `MTX-CORE-QA-001`: Core QA E2E verification suite targets `MTX-CORE-001..005` combined intake.

---

## 6. Reviewer Acceptance Checklist

- [ ] **Server-Authored Context**: Multi-taxi order creation populates `runtimeProfileCode="multi_taxi_direct"`, `serviceProductCode="taxi_reservation"`, and `acquisitionMode="platform_reserved"` server-side.
- [ ] **Fail-Closed Override Guard**: Client-supplied attempts to specify `acquisitionMode`, `queueMode`, `runtimeProfileCode`, `serviceProductCode`, or `operatingAuthorizationId` on intake return fail-closed errors.
- [ ] **Illegal Acquisition Modes Blocked**: `street_hail` acquisition mode is denied; `physical_rank` acquisition mode is denied.
- [ ] **Valid Intake Passing**: On-demand and scheduled `platform_reserved` intake requests create valid multi-taxi orders.
- [ ] **Token Persistence & Readback**: Passenger ride access tokens survive persistence and allow clean order readback after restart in integration tests.
- [ ] **No `any` Annotations**: Touched `owned-mobility` service entrypoints have explicit return type signatures without `: any`.
- [ ] **Test Coverage**: All unit (`owned-mobility.service.test.ts`, `multi-taxi.service.test.ts`) and integration (`int-mtx-001-runtime-authority.test.ts`) tests pass cleanly.
- [ ] **Support Evidence Present**: Both `CURRENT-HEAD-PREFLIGHT.md` and `MTX-CORE-001-ACCEPTANCE.md` are committed under `support/sidecars/MTX-CORE-001/`.
- [ ] **Canonical Safety**: No canonical L1 specification documents or unrelated runtime contracts have been mutated by this sidecar packet.

---

## 7. Handoff Notes For Parent Owner & Reviewer

- **Role Separation**: This packet is produced by `Gemini` (sidecar owner) for review by `Codex` (sidecar reviewer). Parent task `MTX-CORE-001` is owned by `Codex` and reviewed by `Gemini`.
- **Baseline Note**: `pnpm --filter @drts/api exec tsc --noEmit` has pre-existing contract drift in unrelated modules outside `MTX-CORE-001`. Scoped unit and integration Vitest suites are the authoritative test evidence for `MTX-CORE-001`.
- **Verification Execution**: Execute the Vitest test command listed in Section 2 to verify runtime authority compliance before approving the parent task handoff.

---

## 8. Evidence References

- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/06_multi_taxi_runtime_execution_register_20260723.md`
- `docs/02-architecture/phase1-p5-s3-multi-taxi-20260720/03_gap_closure_implementation_plan.md`
- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`
- `apps/api/tests/unit/owned-mobility.service.test.ts`
- `apps/api/tests/unit/multi-taxi.service.test.ts`
- `apps/api/tests/integration/int-mtx-001-runtime-authority.test.ts`
- `support/sidecars/MTX-CORE-001/CURRENT-HEAD-PREFLIGHT.md`
- `support/sidecars/MTX-CORE-001/MTX-CORE-001-ACCEPTANCE.md`
- Git commit: `e767f8b53980002586faf880b93a0e2a1815135c` on branch `codex/mtx-core-001`
