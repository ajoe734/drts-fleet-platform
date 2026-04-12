# W8-001A Sidecar Acceptance Packet

> **Parent Task:** `W8-001A` - Client integration and feature-flag rollout
> **Parent Owner / Reviewer:** `Qwen` / `Codex`
> **Sidecar Owner / Reviewer:** `Codex` / `Qwen`
> **Helper Kind:** `acceptance_packet`
> **Mutates Canonical:** `false`
> **Source of task truth:** `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`, `docs-site/index.html`

This packet is a support artifact only. It does not modify L1 product truth, core contracts, or runtime/governance implementation. It exists to help the parent owner and reviewer close `W8-001A` with a focused acceptance pass.

---

## 1. Task Posture

### 1.1 Official upstream dependencies from `ai-status.json`

| ID        | Status | Why it matters to `W8-001A`                                                                                                                            |
| --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `W7-001A` | `done` | Client pages depend on persisted repositories and read models rather than transient in-memory-only state.                                              |
| `W7-001B` | `done` | Tenant, ops, and driver clients are expected to work under Bootstrap auth headers and the hardened realm/scope model.                                  |
| `W7-001C` | `done` | Tenant webhook and artifact runtime hardening underpins webhook management, notifications, and report/download follow-up surfaces used by the clients. |

### 1.2 Cross-slice touchpoints worth reviewing together

| Slice     | Status        | Touchpoint                                                                                                                                         |
| --------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `W2-002A` | `done`        | Tenant booking list and driver jobs/trip screens consume owned order and driver-task data from the owned mobility slice.                           |
| `W4-001A` | `done`        | Tenant billing and driver earnings consume invoice and driver-statement read models from billing/settlement.                                       |
| `W5-001A` | `done`        | Tenant and ops reports pages both consume `GET /api/reports/jobs`.                                                                                 |
| `W7-001D` | `done`        | Runtime responses now emit canonical `snake_case`; client pages still leaning on legacy camelCase fallbacks need explicit review.                  |
| `W8-001E` | `in_progress` | Driver settings, incident, maintenance, attendance, and earnings all share `@drts/api-client`; any client-side envelope fix should be coordinated. |

### 1.3 Current parent state

- `W8-001A` is still `in_progress` in shared status.
- Latest shared-truth parent note (`2026-04-11T13:54:13Z`) says review is blocked on tenant portal and driver app list-envelope handling, plus broken in-memory feature-flag tenant overrides.
- This sidecar pass confirms those blockers and widens the tenant-portal evidence set: the same `{ items }` drift exists beyond the three example pages already called out in `current-work.md`.

---

## 2. Evidence Inventory

### 2.1 Shared rollout plumbing present in repo

| Area                         | Evidence                                                                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared API client            | `packages/api-client/src/index.ts` unwraps `ApiSuccessEnvelope<T>` to `envelope.data` and exposes the tenant, ops, and driver list/read-model methods used by Wave 8 clients. |
| Feature flags backend        | `apps/api/src/modules/feature-flags/feature-flags.controller.ts`, `feature-flags.service.ts`, `feature-flag.repository.ts`                                                    |
| Tenant portal client factory | `apps/tenant-portal-web/lib/api-client.ts`                                                                                                                                    |
| Ops console client factory   | `apps/ops-console-web/lib/api-client.ts`                                                                                                                                      |
| Driver app client factory    | `apps/driver-app/lib/api-client.ts`                                                                                                                                           |
| W8-001A-specific unit test   | `tests/unit/client-integration.test.ts`                                                                                                                                       |

### 2.2 Surfaces that already handle `{ items }` correctly

| Surface             | Evidence                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Ops dispatch page   | `apps/ops-console-web/app/dispatch/page.tsx` uses `(result as any)?.items ?? result ?? []`              |
| Ops attendance page | `apps/ops-console-web/app/attendance/page.tsx` unwraps both shifts and attendance via `.items` fallback |
| Driver shift page   | `apps/driver-app/app/shift.tsx` unwraps `client.listShifts()` via `.items` fallback                     |

### 2.3 Surfaces still treating `data` as an array

| Surface                                | Evidence                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Tenant portal booking list             | `apps/tenant-portal-web/app/booking-list/page.tsx` casts `client.listOrders()` to `unknown[]`                                     |
| Tenant portal billing                  | `apps/tenant-portal-web/app/billing/page.tsx` casts `client.listInvoices()` to `unknown[]`                                        |
| Tenant portal reports                  | `apps/tenant-portal-web/app/reports/page.tsx` casts `client.listReportJobs()` to `unknown[]`                                      |
| Tenant portal passengers               | `apps/tenant-portal-web/app/passengers/page.tsx` casts `client.listPassengers()` to `unknown[]`                                   |
| Tenant portal users                    | `apps/tenant-portal-web/app/users/page.tsx` casts `client.listTenantUsers()` to `unknown[]`                                       |
| Tenant portal addresses                | `apps/tenant-portal-web/app/addresses/page.tsx` casts `client.listAddresses()` to `unknown[]`                                     |
| Tenant portal API keys                 | `apps/tenant-portal-web/app/api-keys/page.tsx` casts `client.listApiKeys()` to `unknown[]`                                        |
| Tenant portal webhooks + notifications | `apps/tenant-portal-web/app/webhooks/page.tsx` treats both `client.listWebhooks()` and `client.listNotifications()` as arrays     |
| Driver jobs                            | `apps/driver-app/app/jobs.tsx` uses `Array.isArray(data) ? data : []` on `client.listDriverTasks()`                               |
| Driver trip                            | `apps/driver-app/app/trip.tsx` uses `Array.isArray(tasks)` on `client.listDriverTasks()`                                          |
| Driver earnings                        | `apps/driver-app/app/earnings.tsx` uses `Array.isArray(data) ? data : []` on `client.listDriverStatements()`                      |
| Residual ops-console drift             | `apps/ops-console-web/app/reports/page.tsx` and `apps/ops-console-web/app/contracts/page.tsx` still cast list responses to arrays |

### 2.4 Backend list routes returning `{ items: [...] }`

| Route                                                                                                                                     | Evidence                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/orders`                                                                                                                         | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` returns `{ items: this.ownedMobilityService.listOrders() }`                       |
| `GET /api/driver/tasks`                                                                                                                   | `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts` returns `{ items: this.ownedMobilityService.listDriverTasks() }`                  |
| `GET /api/driver-statements`                                                                                                              | `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts` returns `{ items: this.billingSettlementService.listDriverStatements() }` |
| `GET /api/reports/jobs`                                                                                                                   | `apps/api/src/modules/reporting-filing/reporting-filing.controller.ts` returns `{ items: this.reportingFilingService.listReportJobs() }`             |
| `GET /api/tenant/passengers`, `/tenant/addresses`, `/tenant/users`, `/tenant/api-keys`, `/tenant/webhooks`, `/tenant/webhooks/deliveries` | `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts` returns `{ items: ... }` for each list route                                      |
| `GET /api/notifications`                                                                                                                  | `apps/api/src/modules/audit-notification/notifications.controller.ts` returns `{ items: this.auditNotificationService.listNotifications() }`         |
| `GET /api/regulatory-registry/contracts`                                                                                                  | `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts` returns `{ items: this.regulatoryRegistryService.listContracts() }`     |

### 2.5 Existing verification evidence

- Command run in this sidecar pass: `pnpm test:unit tests/unit/client-integration.test.ts`
- Result: `1/1` test file passed, `13/13` tests passed.
- Important limitation: this test file validates seed counts, flag keys, summary shape, and the immediate return value of `upsertTenantOverride()`, but it does not read tenant overrides back through `getAll()`, `getByKey()`, or `isEnabled()`, and it does not render any client pages.
- Shared truth in `current-work.md` also records an earlier green `pnpm test:unit` run (`82/82`) while the current review blockers still existed, so acceptance should treat current test coverage as insufficient rather than authoritative.

---

## 3. Acceptance Gate Snapshot

| Gate                                                                | Status          | Evidence / note                                                                                                                                   |
| ------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Official dependencies completed                                     | `PASS`          | `W7-001A`, `W7-001B`, and `W7-001C` are all `done` in shared status.                                                                              |
| Shared client and feature-flag rollout plumbing exist               | `PASS`          | Shared API client, per-surface client factories, feature-flags module, and W8-specific unit tests are present.                                    |
| In-memory feature-flag tenant overrides are readable end-to-end     | `FAIL`          | `upsertTenantOverride()` writes `${key}:${tenantId}`, but `getAll(tenantId)` and `getByKey(key, tenantId)` never read that key.                   |
| Tenant portal list/read-model pages unwrap `{ items }` consistently | `FAIL`          | Booking, billing, reports, passengers, users, addresses, API keys, and webhooks/notifications still assume array payloads.                        |
| Driver jobs/trip/earnings pages unwrap `{ items }` consistently     | `FAIL`          | `jobs.tsx`, `trip.tsx`, and `earnings.tsx` still treat `data` as an array.                                                                        |
| Driver earnings page maps the actual statement fields               | `FAIL`          | UI expects `id`, `totalEarnings`, `periodStart`, `periodEnd`; contracts/service expose `statementId`, `grossEarning`, `netAmount`, `periodMonth`. |
| Previously fixed pages remain aligned                               | `PASS`          | Ops dispatch, ops attendance, and driver shift already unwrap `.items` correctly.                                                                 |
| W8-001A targeted unit coverage is green                             | `PASS_WITH_GAP` | `tests/unit/client-integration.test.ts` passes, but it does not cover the observed blockers.                                                      |
| Parent slice ready for Codex final review                           | `NOT YET`       | The packet identifies concrete rollout blockers that should be fixed or explicitly waived first.                                                  |

---

## 4. Confirmed Hotspots And Likely Blockers

### 4.1 FeatureFlagsService in-memory fallback loses tenant overrides after write

| Evidence                                                                                                                                    | Why it blocks acceptance                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `apps/api/src/modules/feature-flags/feature-flags.service.ts` stores overrides as `this.inMemoryFlags.set(\`${key}:${tenantId}\`, updated)` | The write path creates a tenant-scoped key.                                                         |
| The same service's `getAll(tenantId)` explicitly returns the base in-memory flags and comments `No tenant overrides in in-memory mode`      | Tenant-specific reads cannot surface the override that was just written.                            |
| `getByKey(key, tenantId)` ignores `tenantId` in in-memory mode and only reads `this.inMemoryFlags.get(key)`                                 | Direct single-flag reads miss the override.                                                         |
| `isEnabled(key, tenantId)` delegates to `getByKey()`                                                                                        | Feature-gated client behavior remains wrong in fallback mode even after a successful override call. |
| `tests/unit/client-integration.test.ts` only asserts the return value of `upsertTenantOverride()`                                           | Existing W8-specific tests do not catch the broken readback path.                                   |

### 4.2 Tenant portal list/read-model pages still assume raw arrays

| Page                    | Backend shape                                                                   | Acceptance impact                                                            |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `booking-list/page.tsx` | `GET /api/orders` returns `{ items }`                                           | Booking list can render a false empty state even when orders exist.          |
| `billing/page.tsx`      | `GET /api/tenant/invoices` returns `{ items }`                                  | Billing page can show profile data but silently drop invoices.               |
| `reports/page.tsx`      | `GET /api/reports/jobs` returns `{ items }`                                     | Report job history can render empty despite backend data.                    |
| `passengers/page.tsx`   | `GET /api/tenant/passengers` returns `{ items }`                                | Passenger directory appears empty.                                           |
| `users/page.tsx`        | `GET /api/tenant/users` returns `{ items }`                                     | Tenant user list appears empty.                                              |
| `addresses/page.tsx`    | `GET /api/tenant/addresses` returns `{ items }`                                 | Address book appears empty.                                                  |
| `api-keys/page.tsx`     | `GET /api/tenant/api-keys` returns `{ items }`                                  | API key inventory appears empty.                                             |
| `webhooks/page.tsx`     | `GET /api/tenant/webhooks` and `GET /api/notifications` both return `{ items }` | Both webhook endpoints and notification feeds can render false empty states. |

Notes:

- `tenant-portal-web/app/page.tsx` and `tenant-portal-web/app/feature-flags/page.tsx` are not part of this specific list-envelope bug because they consume direct objects (`FeatureFlagSummary`, identity context) rather than list envelopes.
- The tenant-portal pattern is broader than the three example pages already mentioned in the parent task note.

### 4.3 Driver jobs/trip/earnings remain out of sync with the actual response shapes

| Page                               | Evidence                                                                                  | Acceptance impact                                                                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `apps/driver-app/app/jobs.tsx`     | `client.listDriverTasks()` is treated as a raw array via `Array.isArray(data)`            | Assigned tasks can render as empty even when the backend returns `{ items: [...] }`. |
| `apps/driver-app/app/trip.tsx`     | First-task selection and refresh both assume `listDriverTasks()` returns an array         | The active trip screen can never hydrate from a valid `{ items }` payload.           |
| `apps/driver-app/app/earnings.tsx` | `listDriverStatements()` is treated as a raw array and also mapped with wrong field names | Earnings can render empty or misleading cards even when statements exist.            |
| `apps/driver-app/app/shift.tsx`    | Uses `(result as any)?.items ?? result ?? []`                                             | Good control example: this surface already shows the correct unwrapping pattern.     |

### 4.4 Residual ops-console drift is smaller but not fully eliminated

| Page                                                                   | Evidence                                                                           | Why it matters                                                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `apps/ops-console-web/app/reports/page.tsx`                            | Casts `client.listReportJobs()` to `unknown[]`                                     | Same `{ items }` bug persists on at least one ops surface outside the pages already fixed.     |
| `apps/ops-console-web/app/contracts/page.tsx`                          | Casts `client.listContracts()` to `unknown[]` while controller returns `{ items }` | Registry read models can still false-empty even though related ops pages were already updated. |
| `apps/ops-console-web/app/dispatch/page.tsx` and `attendance/page.tsx` | Already unwrap `.items`                                                            | Useful baseline for how the remaining pages should behave.                                     |

### 4.5 Coverage gap is now the main acceptance risk multiplier

- The current W8-specific test file is green, but it only proves that the feature-flag service seeds data and that `upsertTenantOverride()` returns an object.
- It does not prove:
  - tenant override readback via `getAll(tenantId)`
  - tenant override readback via `getByKey(key, tenantId)` and `isEnabled(key, tenantId)`
  - that any tenant/ops/driver page unwraps list envelopes correctly
  - that driver earnings maps the actual `DriverStatementRecord` fields correctly
- Because `current-work.md` already records a fully green unit suite while these UI/runtime gaps remained, acceptance should not rely on existing unit coverage alone.

---

## 5. Recommended Review Order

1. Fix the feature-flag fallback semantics first.
   Make `getAll(tenantId)`, `getByKey(key, tenantId)`, and `isEnabled(key, tenantId)` honor the same tenant override key shape that `upsertTenantOverride()` writes in in-memory mode.

2. Normalize list-envelope consumption next.
   Apply the same `.items` fallback pattern already used in `ops-console-web/app/dispatch/page.tsx`, `ops-console-web/app/attendance/page.tsx`, and `driver-app/app/shift.tsx` to the remaining tenant portal and driver pages.

3. Reconcile driver earnings field mapping before review handoff.
   The earnings screen should render the actual `DriverStatementRecord` fields rather than legacy placeholders like `id` and `totalEarnings`.

4. Expand W8-001A-specific verification.
   Minimum useful additions are override readback assertions in `tests/unit/client-integration.test.ts` plus one small contract-level test around list-envelope consumption.

5. Re-run focused verification after fixes.
   Suggested minimum rerun:
   - `pnpm test:unit tests/unit/client-integration.test.ts`
   - `pnpm test:unit tests/unit/owned-mobility.test.ts tests/unit/tenant-partner-foundation.test.ts tests/unit/billing-settlement.test.ts tests/unit/reporting-filing.test.ts`
   - Manual smoke of tenant portal `/booking-list`, `/billing`, `/reports`, `/passengers`, `/users`, `/addresses`, `/api-keys`, `/webhooks`
   - Manual smoke of driver app `/jobs`, `/trip`, `/earnings`

---

## 6. Handoff Notes For `Qwen`

- This packet is ready for sidecar review as a support artifact.
- The primary unresolved items are:
  - broken in-memory tenant override readback in `FeatureFlagsService`
  - tenant portal list-envelope drift across booking, billing, reports, directory, API keys, and webhook/notification pages
  - driver jobs/trip/earnings still assuming raw arrays
  - driver earnings field mapping drift
  - residual ops reports/contracts envelope drift
  - W8-specific tests staying green while missing the actual failure modes
- `W8-001A` should not be handed to `Codex` for the main final review until those items are fixed or explicitly waived by the parent owner with rationale.
