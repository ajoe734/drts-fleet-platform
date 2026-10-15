# UAT Report: HEALTH-OBSERVABILITY-SOURCE-TRUTH-20261015

- **Task ID**: `HEALTH-OBSERVABILITY-SOURCE-TRUTH-20261015`
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/health-observability-source-truth-20261015`
- **Base (`origin/dev`)**: `abffadbbcba5fe236f4ae7b49ee59003910fd9b5`
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1319-remaining-original-configuration-root/HEALTH-OBSERVABILITY-SOURCE-TRUTH-20261015-R1.task-spec.json`
- **Readonly Audit Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1319-remaining-original-configuration-root/C108-current-accepted-health-alert-dataflow-readonly-audit.json`

---

## 1. Finding-to-Verification Mapping (`AI_COLLABORATION_GUIDE.md` §0.7)

| Finding / Acceptance Key | Root Cause & Pre-Repair Behavior | Code Location Fixed | Verification Test & Assertion |
| --- | --- | --- | --- |
| **`C108-F1`** / `health-observability_actual-Platform-and-Ops-unknown-zero-error-stale-source` | **Platform (`/health`)**: Initial state and `.catch()` in `apps/platform-admin-web/app/health/page.tsx` seeded `emptyObservability` (`generatedAt: new Date(0).toISOString()`, all counters `0`, `alerts: []`). On first rejected `/api/operational-observability` read, KPIs rendered `0` / `—` with `delta: "ok"`, summary sections rendered `0`, and active alerts rendered `"No active alerts."` alongside an error banner. Failed refresh overwrote prior valid snapshot with fake zeros.<br>**Ops (`/dashboard`)**: `apps/ops-console-web/app/dashboard/page.tsx` caught `/api/operational-observability` failures to `null`, derived `health.status = "healthy"` whenever `/api/health` liveness returned `"healthy"` (because `adapterDetails ?? []` had `0` degraded items), set `refresh.freshness = "fresh"`, `refresh.source = "live"`, `refresh.lastUpdatedAt = new Date().toISOString()`, `Stale Location` KPI to `0` (`within SLA`), and adapter empty state to `"not_configured"`. | `apps/platform-admin-web/app/health/health-observability-model.ts`<br>`apps/platform-admin-web/app/health/page.tsx`<br>`apps/ops-console-web/app/dashboard/observability-read-state.ts`<br>`apps/ops-console-web/app/dashboard/page.tsx` | `tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts` (`describe("1. health-observability_actual-Platform-and-Ops-unknown-zero-error-stale-source")`):<br>- Captures pre-repair false `0`/`ok`/`no-alert` and Ops `healthy`/`live`/`fresh` bug.<br>- Exercises `initial`, `loading`, `permission_denied`, `unavailable`, `empty`, `successful_zero`, `nonzero`, and `stale` states across both production read models and rendered `HealthPage` / `OpsDashboardPage` components.<br>- Verifies `sourceTimestamp` is never fabricated from `new Date().toISOString()` on failure, independent sections (`adapters`) survive partial failure, and failed refresh preserves prior valid snapshot with original `sourceGeneratedAt` and explicit `stale` status before recovering on subsequent valid read. |
| **`C108-F2`** / `health-observability_actual-per-adapter24h-and-latest-event-provenance` | `apps/platform-admin-web/app/health/page.tsx` computed per-adapter `orders24h` via `Math.round(observability.forwarderOps.totalForwardedOrders / Math.max(adapters.length, 1))`, fabricating an equal share of all-time global forwarded orders across every adapter. | `apps/platform-admin-web/app/health/health-observability-model.ts` (`computePerAdapterOrders24h`, `loadPlatformHealthSources`, `buildPlatformHealthViewModel`)<br>`apps/platform-admin-web/app/health/page.tsx` | `tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts` (`describe("2. health-observability_actual-per-adapter24h-and-latest-event-provenance")`):<br>- Exercises `listForwarderOrders()` via `loadPlatformHealthSources` and `computePerAdapterOrders24h` over `[referenceMs - 86_400_000, referenceMs]`.<br>- Verifies uneven adapter distributions (`yoxi = 2`, `uber_taiwan = 1`, `grab_taiwan = 0`), excludes out-of-window (`> 24h`), future-skewed, and invalid timestamps, preserves legitimate `0` (`"0"`), and renders `"—"` (`orders24hCount: null`) when the order count source is `unavailable` or `permission_denied` while preserving global `observability.forwarderOps.totalForwardedOrders`. |
| **`C108-F3`** / `health-observability_actual-per-adapter24h-and-latest-event-provenance` | `apps/platform-admin-web/app/health/page.tsx` selected `lastEvent` using fixed priority `adapter.lastWebhookReceivedAt ?? adapter.lastRateLimitAt ?? adapter.lastAuthFailureAt ?? adapter.lastCheckedAt`, displaying an older webhook timestamp even when a newer `lastRateLimitAt` or `lastAuthFailureAt` existed, and conflated `lastCheckedAt` / UI refresh time with actual adapter events. | `apps/platform-admin-web/app/health/health-observability-model.ts` (`selectAdapterLatestEvent`, `parseValidIsoTimestamp`)<br>`apps/platform-admin-web/app/health/page.tsx` | `tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts` (`describe("2. health-observability_actual-per-adapter24h-and-latest-event-provenance")`):<br>- Verifies chronological max selection across `lastWebhookReceivedAt`, `lastRateLimitAt`, and `lastAuthFailureAt` (newer rate-limit or auth-failure beats older webhook).<br>- Distinguishes `lastEventAt` (`webhook` / `rate_limit` / `auth_failure`), `lastCheckedAt` (`checked_only` when no event timestamps exist), and `uiRefreshedAt`.<br>- Keeps invalid/missing timestamps as `unknown` (`Unknown` / `未知`) without `Invalid Date`. |
| **`health-observability_original-alert-role-auth-stub-and-positive-regressions`** | Repairs to Platform/Ops consumers must preserve existing `C108` `ForwarderService` failure classifications (`rate_limit`, `auth`, `credential`, `webhook`, `retryable` vs fatal), `stub` vs `production_ready` capability identity, `OperationalObservabilityService` valid queue `0` lag vs `null` lag, alert routing (`ops`, `platform`), and `OperationalObservabilityController` realm/scope metadata (`["platform", "ops"]`, `["audit:read"]`). | `apps/platform-admin-web/app/health/health-observability-model.ts`<br>`apps/ops-console-web/app/dashboard/observability-read-state.ts` | `tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts` (`describe("3. health-observability_original-alert-role-auth-stub-and-positive-regressions")`) + `tests/unit/system-remediation/sr-qa-governance-001/c108-health-observability-forwarders.test.ts` + `tests/unit/system-remediation/sr-env-copy-001/admin-health.test.ts`:<br>- End-to-end socket-free wiring of `ApiClient` -> `OperationalObservabilityController` / `ForwarderController` -> `OperationalObservabilityService` / `ForwarderService` -> `loadPlatformHealthSources` / `buildPlatformHealthViewModel` / `selectOpsActiveAlerts`. |
| **`health-observability_exact-candidate-validation`** | Candidate must keep diff strictly within the 6 authorized `write_scopes`, pass package typechecks, `i18n-guard`, and unit/regression tests on the exact candidate SHA without starting any VM server/listener. | All 6 write-scoped paths | Verified below with exact commands and exit code `0`. |

---

## 2. Before / After Reproduction Summary

### Before Repair
1. **Platform `/health` (`apps/platform-admin-web/app/health/page.tsx`)**:
   - Initial state used `emptyObservability` (`generatedAt: "1970-01-01T00:00:00.000Z"`, all metrics `0`, `alerts: []`).
   - When `client.getOperationalObservability()` rejected on initial load (e.g. HTTP `503` or `403`), `.catch()` set `errorMessage` but kept `observability = emptyObservability`. The page simultaneously rendered an error banner AND fake measured KPIs (`0`, `delta: "ok"`), `0` queue summaries, and `"No active alerts."`.
   - Each adapter row computed `orders24h = Math.round(observability.forwarderOps.totalForwardedOrders / Math.max(adapters.length, 1))`, dividing all-time global forwarded orders equally across adapters.
   - Each adapter row selected `lastEvent = adapter.lastWebhookReceivedAt ?? adapter.lastRateLimitAt ?? adapter.lastAuthFailureAt ?? adapter.lastCheckedAt`, allowing an older webhook timestamp to shadow a newer `429` rate-limit or `401` auth failure.
2. **Ops `/dashboard` (`apps/ops-console-web/app/dashboard/page.tsx`)**:
   - `client.getEnvelope("/api/operational-observability").catch(() => null)` swallowed the failure into `observability = null`.
   - Because `adapters = observability?.adapterDetails ?? []` evaluated to `[]` (`degradedAdapters.length === 0`), `health.status` was computed as `"healthy"` whenever `/api/health` liveness was `"healthy"`.
   - `refresh` was hardcoded to `freshness: "fresh"`, `source: "live"`, and `lastUpdatedAt: healthPayload?.timestamp ?? new Date().toISOString()`.
   - `Stale Location` KPI fell back to `staleDrivers = 0` with `delta: "within SLA"`, and the adapter table reported `emptyReason = "not_configured"` (`"Not provisioned"`).

### After Repair
1. **Platform `/health` (`apps/platform-admin-web/app/health/health-observability-model.ts` & `page.tsx`)**:
   - Tracks independent per-source slice states (`initial`, `loading`, `permission_denied`, `unavailable`, `ready`, `stale`) and data postures (`unknown`, `empty`, `successful_zero`, `nonzero`) for `observability`, `adapters`, and `forwardedOrders`.
   - On initial/loading or failed first read (`permission_denied` / `unavailable`), KPIs render `"—"` or localized `"Unknown"` with `"Permission Denied"` / `"Unavailable"` delta and neutral tone—never `0` or `"ok"`, and never `"No active alerts."`.
   - On failed refresh after a valid read, retains the prior valid snapshot with its original `sourceTimestamp` (`observability.generatedAt`), marks status as `"stale"`, and displays a warning banner distinguishing `sourceGeneratedAt` from `uiRefreshedAt`.
   - `computePerAdapterOrders24h` filters authoritative `ForwardedOrderRecord[]` from `client.listForwarderOrders()` by matching normalized `platformCode` and valid `createdAt` (or `updatedAt`) within `[referenceMs - 86_400_000, referenceMs]`. Legitimate zero renders `"0"`; missing/denied order source renders `"—"` (`orders24hCount: null`).
   - `selectAdapterLatestEvent` parses all candidate event timestamps (`lastWebhookReceivedAt`, `lastRateLimitAt`, `lastAuthFailureAt`), picks the chronological maximum, and distinguishes `checked_only` (`lastCheckedAt`) and `uiRefreshedAt`. Invalid or missing timestamps remain `unknown`.
2. **Ops `/dashboard` (`apps/ops-console-web/app/dashboard/observability-read-state.ts` & `page.tsx`)**:
   - `loadOpsObservabilityReadState` classifies `/api/operational-observability` reads into `initial`, `loading`, `permission_denied`, `unavailable`, `ready` (`empty` / `successful_zero` / `nonzero`), and `stale`.
   - When `/api/operational-observability` fails even though `/api/health` is `"healthy"`, `buildOpsHealthEnvelope` reports `status: "degraded"` with `degradedDependencies: ["operational-observability"]` (and `"api-health"` if liveness also failed).
   - `buildOpsRefreshMetadata` reports `freshness: "unknown"`, `source: "fallback"`, and `lastUpdatedAt: null` on unmeasured failure (never `new Date().toISOString()`), or `freshness: "stale"`, `source: "cache"`, and the original `sourceGeneratedAt` when retaining prior valid data.
   - `resolveOpsStaleLocationKpi` and `resolveOpsAdapterEmptyState` report `unknown` / `error` / `permission_denied` instead of `0` (`within SLA`) or `not_configured`.

---

## 3. Verification Commands, Outputs, and Exit Codes

All checks were executed socket-free in the isolated worktree `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-health-observability-source-truth-20261015`:

1. **Unit & C108 Consumer Regression Suite**:
   ```bash
   pnpm exec vitest run \
     tests/unit/health-observability-source-truth-20261015/health-observability-source-truth.test.ts \
     tests/unit/system-remediation/sr-qa-governance-001/c108-health-observability-forwarders.test.ts \
     tests/unit/system-remediation/sr-env-copy-001/admin-health.test.ts
   ```
   - **Result**: `Test Files 3 passed (3)`, `Tests 33 passed (33)`, exit code `0`.

2. **Package Typechecks**:
   ```bash
   pnpm --filter @drts/platform-admin-web typecheck
   pnpm --filter @drts/ops-console-web typecheck
   ```
   - **Result**: Both `next typegen && tsc --noEmit` commands completed with zero errors, exit code `0`.

3. **i18n Guard**:
   ```bash
   node tools/ci/i18n-guard.mjs
   ```
   - **Result**: `i18n-guard: OK`, exit code `0`.

---

## 4. Scope & Live-Verification Boundary Statement

- **Preserved Credit**: Existing bank/enterprise, `SR-QA-GOVERNANCE-001`, capacity, Forwarder Adapter (`ForwarderService` retryable/fatal, `429` rate-limit, `401` auth, credential, webhook failure classifications, `stub` vs `production_ready` capability identity), `AuditNotificationService` / `PlatformNotice`, and `OperationalObservabilityController` role/realm/scope (`["platform", "ops"]`, `["audit:read"]`) implementations and credits are preserved intact.
- **No Invented Channels & Live Boundary**: No new Email/SMS/Alarm channel is invented. Source-level repair and socket-free unit/model/component verification in this task validate the Platform and Ops observability consumers and dataflow provenance; they do **not** claim whole-capability completion or substitute for live hosted fault-to-intended-role delivery/readback receipts or live Ops/retention/capacity/full-goal environment gates.
