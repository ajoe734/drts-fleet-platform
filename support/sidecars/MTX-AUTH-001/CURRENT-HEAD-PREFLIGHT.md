# Preflight Report: MTX-AUTH-001

- **Task ID:** `MTX-AUTH-001`
- **Title:** Fleet B operating authorization (runtime)
- **Inspected Commit:** `725317b16c14b1e9b8d9448687a4aa9daf92d246`
- **Branch:** `gemini/mtx-auth-001`
- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Timestamp:** `2026-07-23T12:36:30Z`

---

## 1. File Inspection & Scope Mapping

### Contracts & Migrations
- `packages/contracts/src/phase1-p5-s3-multi-taxi.ts`: Defines `MultiTaxiOperatingAuthorizationRecord`, `MultiTaxiAuthorizedVehicleRecord`, `CreateMultiTaxiOperatingAuthorizationCommand`, `UpdateMultiTaxiOperatingAuthorizationCommand`, `AddMultiTaxiAuthorizedVehicleCommand`.
- `infra/migrations/V0056__multi_taxi_runtime_compliance_closure.sql`: Schema definition for `reg.multi_taxi_operating_authorizations` and `reg.multi_taxi_authorized_vehicles`.

### Services & Controllers
- `apps/api/src/modules/multi-taxi/multi-taxi.service.ts`: Implements authorization lifecycle (`create`, `update`, `activate`, `suspend`, `addAuthorizedVehicle`) and ride/queue authorization resolution.
- `apps/api/src/modules/multi-taxi/multi-taxi.repository.ts`: Handles DB persistence for authorizations and vehicle memberships.
- `apps/api/src/modules/multi-taxi/multi-taxi.controller.ts`: Exposes Platform Admin endpoints for multi-taxi authorizations.
- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`: Regulatory authority service for vehicle and driver registry profiles.
- `apps/api/src/modules/owned-mobility/owned-mobility.service.ts`: Enforces P-5 hard gates before assignment disclosure snapshot generation.

---

## 2. Acceptance Criteria Preflight Status

| Acceptance Criteria | Current Status | Findings & Delta |
| --- | --- | --- |
| `approved+effective+authorized vehicle passes` | **Partial** | Basic active window and vehicle check present in `MultiTaxiService`; needs canonical registry integration and explicit pass verification tests. |
| `draft/suspended/expired/revoked denied` | **Partial** | State checks present in `activateAuthorization`/`suspendAuthorization`/`resolveActiveAuthorization`; needs explicit `P5_OPERATING_AUTHORIZATION_INACTIVE` hard reason gate for assignment. |
| `missing membership denied` | **Partial** | `assertAuthorizedVehicle` checks status and window; needs explicit `P5_VEHICLE_NOT_IN_AUTHORIZATION` hard reason gate for assignment. |
| `wrong service area denied` | **Missing** | Needs `P5_AUTHORIZATION_SERVICE_AREA_MISMATCH` check during ride creation/assignment. |
| `inactive fare version denied` | **Missing** | Needs `P5_FARE_VERSION_NOT_ACTIVE` check during ride creation/assignment. |
| `all writes audited` | **Missing** | Audit log recording via `AuditNotificationService` must be wired into all authorization and vehicle membership write operations (`create`, `update`, `activate`, `suspend`, `addAuthorizedVehicle`, `removeAuthorizedVehicle`). |

---

## 3. Implementation Delta & Plan

1. **Admin Lifecycle APIs**:
   - Add `GET /api/platform-admin/multi-taxi/authorizations/:authorizationId/vehicles` to list authorized vehicles.
   - Add `DELETE /api/platform-admin/multi-taxi/authorizations/:authorizationId/vehicles/:vehicleId` to remove authorized vehicle membership.
2. **Audit Logging Integration**:
   - Inject `AuditNotificationService` into `MultiTaxiService` and `RegulatoryRegistryService`.
   - Record audit logs for `createAuthorization`, `updateAuthorization`, `activateAuthorization`, `suspendAuthorization`, `addAuthorizedVehicle`, and `removeAuthorizedVehicle`.
3. **Regulatory Registry & P-5 Hard Gate Integration**:
   - Wire operating authorization authority and vehicle membership validation into `RegulatoryRegistryService` and `OwnedMobilityService`.
   - Enforce hard error reason codes: `P5_OPERATING_AUTHORIZATION_MISSING`, `P5_OPERATING_AUTHORIZATION_INACTIVE`, `P5_VEHICLE_NOT_IN_AUTHORIZATION`, `P5_AUTHORIZATION_SERVICE_AREA_MISMATCH`, `P5_FARE_VERSION_NOT_ACTIVE`.
4. **Verification & Acceptance Suite**:
   - Create unit & integration tests covering all 6 acceptance criteria under `apps/api/tests/unit/multi-taxi-operating-authorization.test.ts` and `apps/api/tests/integration/int-mtx-001-operating-authorization.test.ts`.
   - Create sidecar acceptance evidence: `support/sidecars/MTX-AUTH-001/MTX-AUTH-001-ACCEPTANCE.md`.

---

## 4. Verification Commands

```bash
pnpm --filter @drts/api exec vitest run tests/unit/multi-taxi.service.test.ts tests/unit/multi-taxi-operating-authorization.test.ts tests/integration/int-mtx-001-runtime-authority.test.ts tests/integration/int-mtx-001-operating-authorization.test.ts
```
