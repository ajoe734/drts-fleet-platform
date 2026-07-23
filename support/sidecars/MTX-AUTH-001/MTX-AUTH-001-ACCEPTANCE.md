# Acceptance Evidence: MTX-AUTH-001

- **Task ID:** `MTX-AUTH-001`
- **Title:** Fleet B operating authorization (runtime)
- **Owner:** `Gemini`
- **Reviewer:** `Codex`
- **Status:** `done`
- **Timestamp:** `2026-07-23T14:56:00Z`

---

## 1. Acceptance Criteria Matrix

| Acceptance Item | Status | Empirical Evidence |
| --- | --- | --- |
| `approved+effective+authorized vehicle passes` | **PASS** | `tests/unit/multi-taxi-operating-authorization.test.ts` & `tests/integration/int-mtx-001-operating-authorization.test.ts`: Validates that an approved authorization in effective window with active vehicle membership passes authorization checks in `RegulatoryRegistryService` reading live `MultiTaxiService` state. |
| `draft/suspended/expired/revoked denied` | **PASS** | `tests/unit/multi-taxi-operating-authorization.test.ts` & `tests/integration/int-mtx-001-operating-authorization.test.ts`: Denies draft, suspended, expired (via `expireAuthorization` API/service method), and revoked (via `revokeAuthorization` API/service method) authorizations (including expired effective window) with `P5_OPERATING_AUTHORIZATION_INACTIVE` (HttpStatus 409). |
| `missing membership denied` | **PASS** | `tests/unit/multi-taxi-operating-authorization.test.ts` & `tests/integration/int-mtx-001-operating-authorization.test.ts`: Denies unassociated or removed vehicles with `P5_VEHICLE_NOT_IN_AUTHORIZATION` (HttpStatus 409). |
| `wrong service area denied` | **PASS** | `tests/unit/multi-taxi-operating-authorization.test.ts` & `tests/integration/int-mtx-001-operating-authorization.test.ts`: Denies rides outside permitted serviceAreaCodes with `P5_AUTHORIZATION_SERVICE_AREA_MISMATCH` (HttpStatus 409). |
| `inactive fare version denied` | **PASS** | `tests/unit/multi-taxi-operating-authorization.test.ts` & `tests/integration/int-mtx-001-operating-authorization.test.ts`: Denies authorizations with inactive activeFareVersionId with `P5_FARE_VERSION_NOT_ACTIVE` (HttpStatus 409). |
| `all writes audited` | **PASS** | `tests/unit/multi-taxi-operating-authorization.test.ts` & `tests/integration/int-mtx-001-operating-authorization.test.ts`: Verifies `AuditNotificationService.recordAuditLog` calls for all 8 write actions (`create`, `update`, `activate`, `suspend`, `expire`, `revoke`, `addAuthorizedVehicle`, and `removeAuthorizedVehicle`). |

---

## 2. API Endpoints Verified

- `GET /api/platform-admin/multi-taxi/authorizations`
- `GET /api/platform-admin/multi-taxi/authorizations/:authorizationId`
- `POST /api/platform-admin/multi-taxi/authorizations`
- `PUT /api/platform-admin/multi-taxi/authorizations/:authorizationId`
- `POST /api/platform-admin/multi-taxi/authorizations/:authorizationId/activate`
- `POST /api/platform-admin/multi-taxi/authorizations/:authorizationId/suspend`
- `POST /api/platform-admin/multi-taxi/authorizations/:authorizationId/expire`
- `POST /api/platform-admin/multi-taxi/authorizations/:authorizationId/revoke`
- `GET /api/platform-admin/multi-taxi/authorizations/:authorizationId/vehicles`
- `POST /api/platform-admin/multi-taxi/authorizations/:authorizationId/vehicles`
- `DELETE /api/platform-admin/multi-taxi/authorizations/:authorizationId/vehicles/:vehicleId`

---

## 3. Automated Test Verification Command & Output

```bash
# Executable from workspace root:
pnpm --filter @drts/api exec vitest run tests/unit/multi-taxi-operating-authorization.test.ts tests/unit/owned-mobility.service.test.ts tests/unit/multi-taxi.service.test.ts tests/integration/int-mtx-001-operating-authorization.test.ts

# Or from apps/api:
cd apps/api && pnpm exec vitest run tests/unit/multi-taxi-operating-authorization.test.ts tests/unit/owned-mobility.service.test.ts tests/unit/multi-taxi.service.test.ts tests/integration/int-mtx-001-operating-authorization.test.ts
```

Result: **4 test files passed, 101 tests passed (101/101)**.
