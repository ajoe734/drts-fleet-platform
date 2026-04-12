# W8-001A Sidecar Review Packet

> **Parent Task:** `W8-001A` - Client integration and feature-flag rollout
> **Parent Owner / Reviewer:** `Codex` / `Claude`
> **Sidecar Owner / Reviewer:** `Codex` / `Claude`
> **Helper Kind:** `review_packet`
> **Mutates Canonical:** `false`
> **Created:** `2026-04-11T15:13:09Z`
> **Source of task truth:** `ai-status.json`, `current-work.md`, `ai-activity-log.jsonl`, `docs-site/index.html`

This packet is a support artifact only. It does not modify L1 product truth, core contracts, or primary runtime/governance implementation. It exists to help Claude review the current `W8-001A` repo state after the earlier review blockers were reworked.

---

## 1. Parent Task Posture

### 1.1 Shared-truth status

- `W8-001A` is currently `review` in `ai-status.json` / `current-work.md`.
- The active parent reviewer is now `Claude`; the reviewer baton was auto-reassigned from `Qwen` on `2026-04-11T15:06:41Z`.
- The latest owner handoff recorded in `ai-status.json` says the previously blocked rollout issues were fixed on `2026-04-11T15:06:26Z`, then handed to review on `2026-04-11T15:06:41Z`.

### 1.2 Why this packet is needed

- The existing acceptance helper at `support/sidecars/W8-001A/W8-001A-SIDECAR-ACCEPTANCE.md` accurately captured the blocker state earlier in the day, but it is now stale for review purposes.
- This review packet supersedes the stale blocker narrative with the current repo state and an independent verification pass.

### 1.3 Upstream dependency truth

| Dependency | Shared status | Review relevance                                                                                      |
| ---------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| `W7-001A`  | `done`        | Client surfaces now consume persisted read models rather than in-memory-only runtime data.            |
| `W7-001B`  | `done`        | Tenant, ops, driver, and platform header-based auth context is available for real API calls.          |
| `W7-001C`  | `done`        | Webhook/notification/runtime hardening underpins the tenant portal webhook and notification surfaces. |

---

## 2. Review Timeline From Shared Truth

| Time (UTC)             | Source                               | Meaning                                                                                                                                                                             |
| ---------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2026-04-11T13:54:13Z` | `ai-status.json` handoff log         | Codex blocked review on three issues: tenant/driver list envelope drift, ops complaints/callcenter API gaps, and in-memory feature-flag tenant override readback.                   |
| `2026-04-11T15:06:26Z` | `ai-status.json` handoff log         | Codex recorded those rollout blockers as fixed: tenant override readback, central list unwrapping in `@drts/api-client`, and client pages consuming actual Phase 1 contract fields. |
| `2026-04-11T15:06:41Z` | `ai-status.json` + `current-work.md` | Reviewer baton moved from `Qwen` to `Claude`; parent task stayed in `review`.                                                                                                       |
| `2026-04-11T15:09:44Z` | `current-work.md`                    | This sidecar helper was auto-reassigned to `Codex` after earlier helper attempts by `Qwen` and `Gemini` failed.                                                                     |

The practical implication is that Claude should review the repo against the `15:06:26Z` blocker-fix handoff, not against the stale acceptance packet.

---

## 3. Current Evidence Audit

### 3.1 Shared rollout plumbing present

| Area                         | Evidence                                                                                                                                                                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Feature flags API            | `apps/api/src/modules/feature-flags/feature-flags.controller.ts` exposes `GET /api/admin/flags`, `GET /api/admin/flags/:key`, `PATCH /api/admin/flags/:key`, `POST /api/admin/flags/:key/tenant-overrides`, and `GET /api/admin/flags/:key/enabled`. |
| Feature flags runtime        | `apps/api/src/modules/feature-flags/feature-flags.service.ts` contains the in-memory fallback plus DB-backed repository path.                                                                                                                        |
| Shared client                | `packages/api-client/src/index.ts` contains typed tenant / ops / driver / platform client methods, feature flag reads, and centralized list unwrapping via `getList()`.                                                                              |
| Per-surface client factories | `apps/tenant-portal-web/lib/api-client.ts`, `apps/ops-console-web/lib/api-client.ts`, `apps/driver-app/lib/api-client.ts`                                                                                                                            |
| W8-specific verification     | `tests/unit/client-integration.test.ts`                                                                                                                                                                                                              |

### 3.2 Earlier blocker set vs current repo state

| Earlier blocker                                                                                           | Current evidence                                                                                                                                                                                                                                                                             | Disposition                                                        |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| In-memory tenant override write path did not read back through `getAll()`, `getByKey()`, or `isEnabled()` | `apps/api/src/modules/feature-flags/feature-flags.service.ts` now has `getInMemoryTenantOverride()`, merges tenant overrides in `getAll(tenantId)`, and checks scoped override first in `getByKey(key, tenantId)`                                                                            | `CLOSED`                                                           |
| Tenant / ops / driver list surfaces mis-handled `{ items }` envelopes                                     | `packages/api-client/src/index.ts` now unwraps `{ items }` centrally in `getList()`; previously blocked pages now call typed list methods directly (`client.listOrders()`, `client.listReportJobs()`, `client.listDriverTasks()`, `client.listDriverStatements()`, `client.listContracts()`) | `CLOSED`                                                           |
| Ops complaints and callcenter were not API-backed                                                         | `packages/api-client/src/index.ts` now exposes `listComplaints()` and `listCallSessions()`; `apps/ops-console-web/app/complaints/page.tsx` and `apps/ops-console-web/app/callcenter/page.tsx` call those methods                                                                             | `CLOSED`                                                           |
| Driver incident submit did not align with the intended API payload                                        | Current repo no longer uses the earlier complaint payload shape; `apps/driver-app/app/incident.tsx` calls `client.createIncident(...)`, which matches the active `incident` runtime rather than the older complaint fallback                                                                 | `CLOSED FOR W8-001A REVIEW`, but see shared-file note in section 5 |

### 3.3 Spot-checked pages now consuming contract fields directly

| Surface                    | Evidence                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant portal booking list | `apps/tenant-portal-web/app/booking-list/page.tsx` uses `OwnedOrderRecord[]`, `await client.listOrders()`, and renders `orderNo`, `orderId`, `serviceBucket`, `status`, `createdAt`. |
| Tenant portal reports      | `apps/tenant-portal-web/app/reports/page.tsx` uses `ReportJobRecord[]` and renders `jobId`, `status`, `jobType`, `format`, `createdAt`.                                              |
| Tenant portal webhooks     | `apps/tenant-portal-web/app/webhooks/page.tsx` uses `TenantWebhookEndpoint[]` and `NotificationRecord[]` from client methods directly.                                               |
| Driver jobs                | `apps/driver-app/app/jobs.tsx` stores `DriverTaskRecord[]` directly from `client.listDriverTasks()`.                                                                                 |
| Driver trip                | `apps/driver-app/app/trip.tsx` uses `client.listDriverTasks()` as an array-returning API and refreshes the first task after lifecycle actions.                                       |
| Driver earnings            | `apps/driver-app/app/earnings.tsx` renders current driver statement fields: `statementId`, `receiptNo`, `netAmount`, `grossEarning`, `periodMonth`, `payoutStatus`.                  |
| Ops reports                | `apps/ops-console-web/app/reports/page.tsx` uses `ReportJobRecord[]` directly from `client.listReportJobs()`.                                                                        |
| Ops contracts              | `apps/ops-console-web/app/contracts/page.tsx` uses `VehicleContractRecord[]` directly from `client.listContracts()`.                                                                 |

### 3.4 W8-specific test file is materially stronger than the stale packet described

The earlier acceptance helper referenced a smaller test surface. The current `tests/unit/client-integration.test.ts` now includes:

- feature flag seed coverage across all 14 defaults
- tenant-scoped override readback through `getAll()`, `getByKey()`, and `isEnabled()`
- shared `ApiClient` list-envelope unwrapping checks for tenant, ops, and driver list endpoints

This matters because the old blocker set was specifically about override readback plus list-envelope handling.

---

## 4. Independent Verification Run By This Sidecar

Verification was rerun in this sidecar pass on `2026-04-11T15:12Z` to `2026-04-11T15:13Z`.

| Command                                                | Result                        |
| ------------------------------------------------------ | ----------------------------- |
| `pnpm --filter @drts/api typecheck`                    | `PASS`                        |
| `pnpm --filter @drts/api-client typecheck`             | `PASS`                        |
| `pnpm --filter @drts/tenant-portal-web typecheck`      | `PASS`                        |
| `pnpm --filter @drts/ops-console-web typecheck`        | `PASS`                        |
| `pnpm --filter @drts/driver-app typecheck`             | `PASS`                        |
| `pnpm test:unit tests/unit/client-integration.test.ts` | `PASS` — `1` file, `16` tests |

Additional structural audit:

- `rg` over the previously blocked tenant / driver pages no longer shows the earlier `Array.isArray(...)` / raw-array casting pattern on `booking-list`, `reports`, `webhooks`, `jobs`, `trip`, `earnings`, or `contracts`.
- The central `getList()` unwrapping in `packages/api-client/src/index.ts` is now the main guardrail for these surfaces.

What this sidecar did **not** rerun independently:

- full repo `pnpm lint`
- full repo `pnpm test:unit`
- browser/device manual smoke

Those remain part of the owner handoff history rather than this sidecar's own rerun scope.

---

## 5. Residual Review Notes (Non-blocking)

### 5.1 Shared-file overlap with active `W8-001E`

`W8-001E` is still `in_progress`, and the current repo shows active work in adjacent driver / shared-client areas. For Claude review, this means:

- anchor the `W8-001A` decision on the blocker-fix evidence recorded at `2026-04-11T15:06:26Z`
- treat later incidental churn in shared files as potential `W8-001E` noise unless it directly contradicts the `W8-001A` deliverables

The two most obvious shared touchpoints are:

- `packages/api-client/src/index.ts`
- `apps/driver-app/app/incident.tsx`

### 5.2 Some ops pages still contain redundant `.items` fallback

`apps/ops-console-web/app/complaints/page.tsx` and `apps/ops-console-web/app/callcenter/page.tsx` still do `(result as any)?.items ?? result ?? []` even though the current `ApiClient` already returns arrays for those methods.

This is a cleanup opportunity, not a review blocker:

- it does not break the page
- it is now redundant rather than incorrect
- it can be removed later without changing behavior

### 5.3 Task metadata is thinner than the actual evidence

The `W8-001A` task record in `ai-status.json` still has empty `artifacts` and `acceptance` arrays. Claude should rely on the repo evidence plus the handoff log, not the sparse task metadata, when deciding the parent review.

---

## 6. Reviewer Handoff To Claude

This sidecar packet is ready for Claude review as a support artifact.

Recommended Claude review order:

1. Confirm the old blockers are actually closed at the shared-client / feature-flag layer.
   Spot-check `apps/api/src/modules/feature-flags/feature-flags.service.ts` and `packages/api-client/src/index.ts`.

2. Confirm the formerly broken pages now consume the shared client as typed arrays.
   Good high-signal checks:
   - `apps/tenant-portal-web/app/booking-list/page.tsx`
   - `apps/tenant-portal-web/app/webhooks/page.tsx`
   - `apps/driver-app/app/jobs.tsx`
   - `apps/driver-app/app/earnings.tsx`
   - `apps/ops-console-web/app/reports/page.tsx`
   - `apps/ops-console-web/app/contracts/page.tsx`

3. Use the independent verification table above as the minimum current green bar.

If those checks hold, this sidecar's recommendation is:

- `W8-001A-SIDECAR-REVIEW` is ready to be approved as a support artifact.
- `W8-001A` appears ready for Claude's primary review decision; the previously documented rollout blockers are no longer reflected in the current repo state.
