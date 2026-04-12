# W8-001E Sidecar Acceptance Packet

> **Parent Task:** `W8-001E` - Ops and driver domain completion
> **Parent Owner / Reviewer:** `Qwen` / `Codex`
> **Sidecar Owner / Reviewer:** `Codex` / `Qwen`
> **Helper Kind:** `acceptance_packet`
> **Mutates Canonical:** `false`
> **Source of task truth:** `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`, `docs-site/index.html`

This packet is a support artifact only. It does not modify L1 product truth, core contracts, or runtime/governance implementation. It exists to help the parent owner and reviewer close `W8-001E` with a focused acceptance pass.

---

## 1. Task Posture

### 1.1 Official upstream dependencies from `ai-status.json`

| ID        | Status | Why it matters to `W8-001E`                                                                                                        |
| --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `W7-001A` | `done` | Persistence and migration alignment is the prerequisite for new ops/driver domain snapshots and repository wiring.                 |
| `W7-001B` | `done` | Ops and driver surfaces rely on the auth/bootstrap headers and scope/realm enforcement.                                            |
| `W7-001D` | `done` | All success/error HTTP paths now emit canonical `snake_case`, so W8-001E review must check field names against that wire contract. |

### 1.2 Cross-slice touchpoints worth reviewing together

| Slice     | Status        | Touchpoint                                                                                                                  |
| --------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `W4-001A` | `done`        | Driver earnings UI is backed by `driver-statements` from billing, not by a new W8-only backend.                             |
| `W8-001A` | `in_progress` | Shared `@drts/api-client`, ops console, and driver app surfaces can hide W8-001E defects if envelope/field handling drifts. |
| `W3-001B` | `done`        | Complaint and incident are separate concepts in the consensus packet; driver incident UI must not silently collapse them.   |

### 1.3 Current parent state

- `W8-001E` is still `in_progress` in `ai-status.json`.
- Last machine-readable parent update: `2026-04-11T13:39:47Z`.
- The parent task has no finalized artifact list yet, so this packet uses repo evidence paths instead.

---

## 2. Evidence Inventory

### 2.1 Backend modules and routes present in repo

| Area                        | Evidence                                                                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App wiring                  | `apps/api/src/app.module.ts` imports `IncidentModule`, `MaintenanceModule`, `ShiftAttendanceModule`, and `DriverSettingsModule`.                                      |
| Incident API                | `apps/api/src/modules/incident/incident.controller.ts`, `incident.service.ts`, `incident.repository.ts`, `incident.module.ts`                                         |
| Maintenance API             | `apps/api/src/modules/maintenance/maintenance.controller.ts`, `maintenance.service.ts`, `maintenance.repository.ts`, `maintenance.module.ts`                          |
| Shift / attendance API      | `apps/api/src/modules/shift-attendance/shift-attendance.controller.ts`, `shift-attendance.service.ts`, `shift-attendance.repository.ts`, `shift-attendance.module.ts` |
| Driver settings API         | `apps/api/src/modules/driver-settings/driver-settings.controller.ts`, `driver-settings.service.ts`, `driver-settings.repository.ts`, `driver-settings.module.ts`      |
| Driver earnings data source | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` exposes `GET /api/driver-statements`                                                       |

### 2.2 Client surfaces present in repo

| Surface               | Evidence                                        |
| --------------------- | ----------------------------------------------- |
| Ops incidents         | `apps/ops-console-web/app/incidents/page.tsx`   |
| Ops maintenance       | `apps/ops-console-web/app/maintenance/page.tsx` |
| Ops attendance        | `apps/ops-console-web/app/attendance/page.tsx`  |
| Driver shift          | `apps/driver-app/app/shift.tsx`                 |
| Driver incident       | `apps/driver-app/app/incident.tsx`              |
| Driver earnings       | `apps/driver-app/app/earnings.tsx`              |
| Driver settings       | `apps/driver-app/app/settings.tsx`              |
| Shared client methods | `packages/api-client/src/index.ts`              |

### 2.3 Existing unit coverage

| Test file                               | Scope                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `tests/unit/incident.test.ts`           | Incident create/list/get/update/link-complaint/timeline validation                  |
| `tests/unit/maintenance.test.ts`        | Maintenance create/list/update/validation                                           |
| `tests/unit/shift-attendance.test.ts`   | Clock-in, clock-out, list, abandon, error paths                                     |
| `tests/unit/driver-settings.test.ts`    | Defaults, update, list, partial update                                              |
| `tests/unit/billing-settlement.test.ts` | Existing driver statement generation and billing read-model behavior from `W4-001A` |

---

## 3. Acceptance Gate Snapshot

| Gate                                                                  | Status    | Evidence / note                                                                                                      |
| --------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------- |
| Official dependencies completed                                       | `PASS`    | `W7-001A`, `W7-001B`, `W7-001D` are all `done` in `ai-status.json`.                                                  |
| Ops/driver backend modules exist and are wired into `AppModule`       | `PASS`    | Module imports confirmed in `apps/api/src/app.module.ts`.                                                            |
| Repositories are registered with `DatabaseModule`                     | `PASS`    | Each W8-001E module imports `DatabaseModule` and provides its repository.                                            |
| DB persistence paths match the active migration truth                 | `FAIL`    | Static inspection found schema/table/column drift; see Section 4.                                                    |
| Shared client verb and envelope handling align with API routes        | `FAIL`    | `updateDriverSettings()` uses `POST`, while controller exposes `PATCH`; list and field assumptions drift in UI code. |
| Ops console pages align with backend field names                      | `FAIL`    | `maintenance` page still expects fields not returned by the service contract.                                        |
| Driver app pages align with backend field names and domain boundaries | `FAIL`    | Earnings field map is wrong, and the incident screen still posts to complaint API instead of incident API.           |
| Targeted unit verification is green                                   | `FAIL`    | Targeted run on `2026-04-11` produced `26/28` passing tests; `shift-attendance` has 2 failures.                      |
| Parent slice ready for Codex final review                             | `NOT YET` | The packet identifies concrete blockers that should be resolved or explicitly waived first.                          |

---

## 4. Confirmed Hotspots And Likely Blockers

### 4.1 Migration-to-repository drift

| Area                        | Evidence                                                                                                                                                                                                                                                                  | Why it blocks acceptance                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Incident persistence        | `infra/migrations/V0015__ops_driver_domains.sql` requires `ops.phase1_incidents.incident_no` and `description`; `apps/api/src/modules/incident/incident.repository.ts` inserts only `incident_id`, `status`, `severity`, `category`, `created_at`, `updated_at`, `record` | With DB enabled, insert/update should fail on missing required columns, while the service only logs and continues.    |
| Maintenance persistence     | `V0015` requires `ops.phase1_maintenance_logs.description`; `apps/api/src/modules/maintenance/maintenance.repository.ts` omits `description` from insert/update                                                                                                           | DB write-through is unlikely to succeed as implemented.                                                               |
| Shift persistence           | `V0015` defines `ops.phase1_driver_shifts`; `apps/api/src/modules/shift-attendance/shift-attendance.repository.ts` reads and writes `driver.phase1_shifts` plus `driver.phase1_attendance`                                                                                | Table names do not match the migration, and no migration in `infra/migrations/` defines the `driver.phase1_*` tables. |
| Driver settings persistence | `apps/api/src/modules/driver-settings/driver-settings.repository.ts` reads and writes `driver.phase1_driver_settings`                                                                                                                                                     | No matching migration was found in `infra/migrations/`, so persistence has no canonical table to target.              |

### 4.2 Shared client / route drift

| Area                                   | Evidence                                                                                                                                                                                                                                             | Why it blocks acceptance                                                                                                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Driver settings update verb            | `packages/api-client/src/index.ts` uses `POST /api/driver-settings/:driverId`; `apps/api/src/modules/driver-settings/driver-settings.controller.ts` exposes `@Patch(":driverId")`                                                                    | The driver settings save path is wired to the wrong HTTP verb.                                                                 |
| Driver incident domain boundary        | `apps/driver-app/app/incident.tsx` calls `client.createComplaint(...)`                                                                                                                                                                               | Consensus rules keep complaint and incident separate; W8-001E should land on incident semantics, not silently reuse complaint. |
| Driver earnings envelope and field map | `apps/driver-app/app/earnings.tsx` assumes an array with `id`, `totalEarnings`, `periodStart`, `periodEnd`; `GET /api/driver-statements` returns `{ items: DriverStatementRecord[] }` with `statementId`, `grossEarning`, `netAmount`, `periodMonth` | Even if the API succeeds, the screen will render empty or misleading data.                                                     |
| Ops maintenance field map              | `apps/ops-console-web/app/maintenance/page.tsx` expects `maintenanceId`, `type`, `technician`, `cost`; `maintenance.service.ts` returns `logId`, `maintenanceType`, `recordedBy`, `costAmount`                                                       | The page is not mapped to the actual backend shape.                                                                            |

### 4.3 Contract drift inside the maintenance slice

| Area                                   | Evidence                                                                                                                                                                                                                                                                                                                             | Why it matters                                                                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Shared contracts vs local module types | `packages/contracts/src/index.ts` exports `CreateMaintenanceRecordCommand` / `MaintenanceRecord` with `type`, `maintenanceId`, `technician`, `cost`; `apps/api/src/modules/maintenance/maintenance.types.ts` uses `CreateMaintenanceLogCommand` / `MaintenanceLogRecord` with `maintenanceType`, `logId`, `recordedBy`, `costAmount` | The shared client currently uses `any` for maintenance calls, so the mismatch is not type-enforced and can leak into UI/runtime drift. |

### 4.4 Verification evidence from this sidecar pass

- Command run: `pnpm test:unit tests/unit/incident.test.ts tests/unit/maintenance.test.ts tests/unit/shift-attendance.test.ts tests/unit/driver-settings.test.ts`
- Result: `3` test files passed, `1` failed, `26/28` tests passed.
- Failing file: `tests/unit/shift-attendance.test.ts`
- Failing assertions:
  - `rejects abandoning a non-active shift`
  - `returns 404 for nonexistent shift`
- Failure shape: expectations look for message text such as `Only active shifts can be abandoned` / `Shift not found`, but the thrown string resolves to `Api Request Error`.
- Interpretation: acceptance cannot claim a clean targeted test pass yet; either the tests or the runtime error assertion strategy need alignment.

---

## 5. Recommended Review Order

1. Validate DB truth first.
   Compare `V0015__ops_driver_domains.sql` against `incident.repository.ts`, `maintenance.repository.ts`, `shift-attendance.repository.ts`, and `driver-settings.repository.ts`. This is the highest-risk gap because failed writes are currently soft-failed via logger warnings.

2. Fix shared client and UI field drift second.
   Review `packages/api-client/src/index.ts`, `apps/ops-console-web/app/maintenance/page.tsx`, `apps/driver-app/app/earnings.tsx`, and `apps/driver-app/app/settings.tsx` together. These are likely to produce false "empty state" acceptance if not reconciled with the actual backend payloads.

3. Re-check driver incident semantics explicitly.
   Confirm whether `apps/driver-app/app/incident.tsx` must switch to `createIncident` for W8-001E, or whether the parent owner intends a documented defer. Without that decision, incident acceptance is semantically ambiguous.

4. Re-run the targeted verification after fixes.
   Minimum suggested rerun:
   - `pnpm test:unit tests/unit/incident.test.ts tests/unit/maintenance.test.ts tests/unit/shift-attendance.test.ts tests/unit/driver-settings.test.ts`
   - `pnpm --filter @drts/api typecheck`
   - A DB-backed smoke path for at least one incident create, one maintenance create, one shift clock-in/out, and one driver settings update

---

## 6. Handoff Notes For `Qwen`

- This packet is ready for sidecar review as a support artifact.
- The main value is not the existence proof of files; it is the set of acceptance blockers that static repo inspection already exposed before a full parent review.
- The most important unresolved items are:
  - repository/migration mismatch for incident, maintenance, shift-attendance, and driver-settings persistence
  - shared client verb mismatch on driver settings
  - driver earnings field/envelope drift
  - ops maintenance field drift
  - driver incident screen still using complaint semantics
  - targeted shift-attendance test failures

If these are fixed or explicitly waived by the parent owner, `W8-001E` should be revalidated and then handed to `Codex` for the main review.
