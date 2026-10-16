# UAT Verification Report — `TENANT-INVOICE-AUTHORITATIVE-READ-20261015`

租戶帳單拒絕以失敗權威查詢的部分行程開帳

- **Task ID**: `TENANT-INVOICE-AUTHORITATIVE-READ-20261015`
- **Owner**: `Gemini2`
- **Reviewer**: `Gemini`
- **Immutable Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/remaining-original-functional-fixes-20261015/TENANT-INVOICE-AUTHORITATIVE-READ-20261015.json` (`sha256: d555704a2b3c2559edbe269a053a6f924f54bc35f016060b7a5a686464271819`)
- **Immutable Audit Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/remaining-original-functional-fixes-20261015/IMMUTABLE_AUDIT_INDEX.json` (`sha256: 039407f95c50427f600f13c0edbe670079b7beaa11689ca27bd148a346be520a`)
- **Dependencies**: `SR-INVOICE-001` (`DONE`), `SR-QA-FINANCE-001` (`DONE`)
- **Base `dev` SHA**: `ed70d73a03dd224e109867c99b7d04128484a3fe`
- **Initial Regression Anchor Commit (before source edit)**: `42254282e14a67a488c9149f7c88cb095888b39c`
- **Repaired Source Anchor Commit**: `a8206adfd6e1a6ae855284284af46fc5865d148b`
- **Candidate Branch**: `gemini2/tenant-invoice-authoritative-read-20261015`
- **Write Scopes**:
  - `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`
  - `tests/unit/tenant-invoice-authoritative-read-20261015/`
  - `docs/04-uat/system-remediation-20260906/TENANT-INVOICE-AUTHORITATIVE-READ-20261015.md`
- **Required Acceptance Keys (4 own Source keys only)**:
  - `tenant-invoice_authoritative-read-failure-refuses-partial-issuance`
  - `tenant-invoice_actual-complete-source-and-recovery-calculation`
  - `tenant-invoice_original-offline-driver-scope-and-artifact-regressions`
  - `tenant-invoice_exact-candidate-validation`

---

## 1. Per-Finding Root Cause, Fix & Verification Summary (`AI_COLLABORATION_GUIDE.md` §0.7)

| Item / Finding ID | Root Cause & Exact Location | Fix Content | Regression Test | Verification Result |
| --- | --- | --- | --- | --- |
| `C077-F1` / `tenant-invoice_authoritative-read-failure-refuses-partial-issuance` | In `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`, `generateTenantInvoice` called `this.listTenantInvoiceTripsInPeriod(tenantId, command.periodStart, command.periodEnd)` -> `this.listLiveSettlementTripsInPeriod(...)`. When `this.billingSettlementRepository?.isEnabled()` was `true` and `this.billingSettlementRepository.listLiveCompletedTenantTrips(...)` threw an error on the canonical PostgreSQL `SELECT`, the `catch` block only logged a warning via `this.billingSettlementRepository.reportPersistenceFailure(error, "list_live_completed_tenant_trips")` and returned the local in-memory `fallbackTrips` subset (`this.liveSettlementTrips`) or seeded demo trips (`this.resolveSeedSettlementTripsInPeriod(...)`). Because the local subset was non-empty, `generateTenantInvoice` proceeded to build invoice lines from the incomplete subset, materialize the PDF artifact, persist the partial invoice (`status: "issued"`), record the `billing.tenant_invoice_generated` success audit log, and return a successful partial invoice. | Updated `generateTenantInvoice` (`apps/api/src/modules/billing-settlement/billing-settlement.service.ts:1353`) to pass `{ requireAuthoritativeRead: true }` to `listTenantInvoiceTripsInPeriod` (`:3568`), which forwards the option to `listLiveSettlementTripsInPeriod` (`:3625`). When `this.billingSettlementRepository?.isEnabled()` is `true` and `listLiveCompletedTenantTrips` rejects during an authoritative read (`options?.requireAuthoritativeRead === true`), the service still reports the failure via `reportPersistenceFailure(error, "list_live_completed_tenant_trips")` and then immediately rethrows any existing `ApiRequestError` or throws `new ApiRequestError(HttpStatus.SERVICE_UNAVAILABLE, "TENANT_INVOICE_TRIP_READ_UNAVAILABLE", "Authoritative completed-trip query for tenant invoice failed: ...", { tenantId, periodStart, periodEnd }, true)` before line materialization, PDF artifact creation, persistence `INSERT`, in-memory invoice map mutation, or success audit logging. | `tests/unit/tenant-invoice-authoritative-read-20261015/tenant-invoice-authoritative-read.test.ts` — suite `1. tenant-invoice_authoritative-read-failure-refuses-partial-issuance` (3 tests: canonical A+B with only A in local cache; seeded demo tenant period with canonical SELECT failure; upstream `ApiRequestError` preservation) | **Original (`ed70d73a03dd224e109867c99b7d04128484a3fe`)**: Exit `1` (`4 failed \| 4 passed`) — original code issued a 1-line partial invoice (`order-c077-trip-A`, `amountMinor: 10000`, `status: "issued"`).<br>**Fixed (`a8206adfd6e1a6ae855284284af46fc5865d148b`)**: Exit `0` (`8 passed`) — rejects with `503 TENANT_INVOICE_TRIP_READ_UNAVAILABLE`, `0` PDF artifacts, `0` DB `INSERT`s, `0` success audits, and local cache (`TRIP_A`) untouched. |
| `tenant-invoice_actual-complete-source-and-recovery-calculation` | When canonical PostgreSQL `SELECT` failed and fell back to partial cache (`TRIP_A` only), a subsequent invoice read or retry would either see the partial issued invoice or risk stale state. The tenant invoice consumer needed to preserve full `TRIP_A + TRIP_B` canonical merge, deduplication by `orderId`, tenant & closed-period filtering, and exact sum (`10000 + 20000 = 30000` minor), while allowing clean recovery once the canonical query succeeds. | By aborting `generateTenantInvoice` prior to any state mutation or persistence when `listLiveCompletedTenantTrips` fails, no partial invoice or artifact is recorded. When the canonical `SELECT` succeeds (initially or on retry after a transient failure), `listLiveSettlementTripsInPeriod` merges canonical rows (`TRIP_A`, `TRIP_B`) with `fallbackTrips` via `mergedByOrderId`, filters strictly by `tenantId` and closed `[periodStart, periodEnd]`, and issues a single complete 2-line invoice (`amountMinor: 30000`) with zero duplicate rows. | `tests/unit/tenant-invoice-authoritative-read-20261015/tenant-invoice-authoritative-read.test.ts` — suite `2. tenant-invoice_actual-complete-source-and-recovery-calculation` (2 tests: canonical A+B complete read with deduplication and tenant/period filtering; transient SELECT failure followed by recovery issuance) | **Original (`ed70d73a03dd224e109867c99b7d04128484a3fe`)**: Recovery test failed (`Exit 1`) because attempt 1 resolved with partial 1-line invoice (`10000` minor).<br>**Fixed (`a8206adfd6e1a6ae855284284af46fc5865d148b`)**: Exit `0` — attempt 1 rejects (`503`), attempt 2 issues exact 1 invoice (`30000` minor, lines `order-c077-trip-A` + `order-c077-trip-B`), `persistedInvoices.size === 1`. |
| `tenant-invoice_original-offline-driver-scope-and-artifact-regressions` | Applying an unconditional throw inside `listLiveSettlementTripsInPeriod` or altering driver-statement readers would break non-invoice read consumers or deliberate offline/noDB/demo and driver-statement seed fallback paths. Additionally, existing `SR-INVOICE-001`, `SR-QA-FINANCE-001`, and `INVOICE-MAIL-20261004` (C079) guarantees had to remain intact. | Scoped `{ requireAuthoritativeRead: true }` strictly to the `generateTenantInvoice` consumer (`:1353`). Kept `listLiveDriverStatementTripsInPeriod`, `generateDriverStatement`, non-invoice tenant statement/payable readers (`!options?.requireAuthoritativeRead`), and disabled-repository (`!this.billingSettlementRepository?.isEnabled()`) offline/demo paths on their original fallback behavior. Preserved real `%PDF-1.4` bytes, SHA-256 `manifestHash`, controlled download resolution, 15-minute link expiry transparent reissue, durable billing profile readback, empty/unclosed/unauthorized/cross-tenant denials, and C079 fresh PG readback (`getTenantInvoiceFresh`, `listTenantInvoicesFresh`). | `tests/unit/tenant-invoice-authoritative-read-20261015/tenant-invoice-authoritative-read.test.ts` — suite `3. tenant-invoice_original-offline-driver-scope-and-artifact-regressions` (3 tests) + existing suites `sr-invoice-001`, `sr-qa-finance-001`, `invoice-mail-20261004`, `billing-settlement*.test.ts` (19 test files, 108 tests) | Exit `0` across all 19 test files (`108 passed`). |
| `tenant-invoice_exact-candidate-validation` | Full repository typecheck, package typecheck/lint, test coverage routing check, and original-before vs fixed-after evidence needed to be verified on the exact candidate tree without starting any forbidden VM runtime processes. | Verified `pnpm --filter @drts/api typecheck`, `pnpm typecheck:root`, `pnpm --filter @drts/api lint`, `pnpm exec eslint tests/unit/tenant-invoice-authoritative-read-20261015/ --max-warnings=0`, `python3 tools/ci/check_test_coverage.py`, and all unit/regression suites in socket-free in-process test harnesses. | All 8 new tests in `tests/unit/tenant-invoice-authoritative-read-20261015/tenant-invoice-authoritative-read.test.ts` + 100 existing billing/invoice/mail tests | Exit `0` for all checks; logs preserved under `.local/tenant-invoice-authoritative-read-20261015/`. |

---

## 2. Original-Before vs Fixed-After Reproduction

### 2.1 Reproduction Setup

To prove that the test suite exercises the real production `BillingSettlementService.generateTenantInvoice` and `BillingSettlementRepository.listLiveCompletedTenantTrips` path and catches the exact C077 partial-issuance bug on unmodified base `dev` (`ed70d73a03dd224e109867c99b7d04128484a3fe`):

1. Extracted unmodified `ed70d73a03dd224e109867c99b7d04128484a3fe` source tree into `.local/tenant-invoice-authoritative-read-20261015/original/`.
2. Configured `tests/unit/tenant-invoice-authoritative-read-20261015/tenant-invoice-authoritative-read.test.ts` to load `BillingSettlementService` from `process.env.TENANT_INVOICE_SERVICE_MODULE_PATH ?? "apps/api/src/modules/billing-settlement/billing-settlement.service.ts"`.
3. Set up canonical PostgreSQL state with eligible completed trips `TRIP_A` (`order-c077-trip-A`, `10000` minor) and `TRIP_B` (`order-c077-trip-B`, `20000` minor) in closed period `2026-05-01T00:00:00.000Z` .. `2026-05-31T23:59:59.000Z`, while populating only `TRIP_A` (`10000` minor) into the local in-memory cache via `handleCompletedTripEvent`, and configured the canonical completed-trip `SELECT` (`FROM ops.phase1_driver_tasks AS tasks INNER JOIN ops.phase1_owned_orders AS orders`) to reject while leaving subsequent `INSERT INTO billing.phase1_tenant_invoices` capable of succeeding.

### 2.2 Original Code (`ed70d73a03dd224e109867c99b7d04128484a3fe`) — Fails as Expected

Command:
```bash
TENANT_INVOICE_SERVICE_MODULE_PATH="$PWD/.local/tenant-invoice-authoritative-read-20261015/original/apps/api/src/modules/billing-settlement/billing-settlement.service.ts" \
  pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/
```
- **Exit Code**: `1` (`4 failed | 4 passed (8)`)
- **Log**: `.local/tenant-invoice-authoritative-read-20261015/original-before-fix.log`
- **Concrete Failure Observed**:
  ```text
  AssertionError: promise resolved "{ invoiceId: 'inv-573e79fa', …(15) }" instead of rejecting
  - Expected:
  PromiseRejected
  + Received:
  PromiseResolved {
    "amount": {
      "amountMinor": 10000,
      "currency": "TWD",
    },
    "artifactDownloadMetadata": { ... },
    "artifactUrl": "https://downloads.internal.drts.local/api/v1/downloads/tenant-invoice/inv-573e79fa?...",
    "invoiceId": "inv-573e79fa",
    "lines": [
      {
        "amount": {
          "amountMinor": 10000,
          "currency": "NTD",
        },
        "orderId": "order-c077-trip-A",
        ...
      },
    ],
    "status": "issued",
    "tenantId": "tenant-c077-auth-001",
  }
  ```

### 2.3 Fixed Candidate (`a8206adfd6e1a6ae855284284af46fc5865d148b`) — Passes

Command:
```bash
pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/
```
- **Exit Code**: `0` (`1 passed (1)`, `8 passed (8)`)
- **Log**: `.local/tenant-invoice-authoritative-read-20261015/fixed-after.log`
- **Behavior Verified**:
  - `generateTenantInvoice` rejects with `ApiRequestError` (`status: 503`, `code: "TENANT_INVOICE_TRIP_READ_UNAVAILABLE"`, `retryable: true`).
  - `artifactPutSpy` is not called (`0` PDF artifacts materialized).
  - `state.invoiceInsertCalls` has length `0` (`0` DB `INSERT`s executed even though `INSERT` is healthy).
  - `recordAuditLogSpy` is not called (`0` `billing.tenant_invoice_generated` audit logs emitted).
  - `listTenantInvoices(TENANT_ID).items` has length `0`, while the local cache still retains `TRIP_A` (`getLiveSettlementTrips()` is not cleared).

---

## 3. Acceptance Key Verification Matrix

| Required Acceptance Key | Verified Scenarios | Command | Exit Code | Evidence Log |
| --- | --- | --- | --- | --- |
| `tenant-invoice_authoritative-read-failure-refuses-partial-issuance` | 1. Canonical DB has `TRIP_A` (`10000`) + `TRIP_B` (`20000`), local cache has only `TRIP_A` (`10000`), canonical `SELECT` rejects, subsequent `INSERT` is healthy -> rejects with `503 TENANT_INVOICE_TRIP_READ_UNAVAILABLE` before materializing invoice, PDF artifact, persistence `INSERT`, or success audit; local cache is not cleared.<br>2. Seeded demo tenant (`tenant-taipei-metro-fleet`) closed period with canonical `SELECT` failure refuses to fall back to `resolveSeedSettlementTripsInPeriod` when repository is enabled.<br>3. Upstream `ApiRequestError` thrown by canonical read is preserved and rethrown without partial issuance. | `pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/` | `0` | `.local/tenant-invoice-authoritative-read-20261015/fixed-after.log` |
| `tenant-invoice_actual-complete-source-and-recovery-calculation` | 1. Healthy canonical `SELECT` returns `TRIP_A` (`10000`) + `TRIP_B` (`20000`) while local cache also has `TRIP_A`, plus out-of-period and other-tenant rows -> deduplicates `TRIP_A` by `orderId`, filters out other-tenant and out-of-period trips, and issues a 2-line invoice (`amountMinor: 30000`, `currency: "TWD"`).<br>2. Transient canonical `SELECT` failure on attempt 1 rejects (`503`) with zero persisted state; once canonical `SELECT` recovers on attempt 2, `generateTenantInvoice` issues the complete 2-line invoice (`30000` minor) with `persistedInvoices.size === 1` and no duplicate rows. | `pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/` | `0` | `.local/tenant-invoice-authoritative-read-20261015/fixed-after.log` |
| `tenant-invoice_original-offline-driver-scope-and-artifact-regressions` | 1. Offline / noDB mode (`databaseService.isEnabled() === false`) continues to issue tenant invoices from in-memory completed trips (`TRIP_A`) and demo seed periods (`tenant-taipei-metro-fleet`).<br>2. Driver statement generation (`generateDriverStatement`) and non-invoice tenant statement reads (`listTenantStatements`) retain their existing fallback scope when `listLiveDriverStatementTripsInPeriod` or non-invoice `listLiveSettlementTripsInPeriod` encounters a query error.<br>3. Preserves `SR-INVOICE-001` real `%PDF-1.4` bytes, `sha256` manifest hash, controlled download stream, 15-minute link expiry transparent reissue, durable billing profile readback (`updateTenantBillingProfile` / `findInvoiceMailBillingProfile`), `400`/`403` denials (cross-tenant, unclosed period, empty period, unauthorized role), and `INVOICE-MAIL-20261004` (C079) fresh PG readback (`getTenantInvoiceFresh`, `listTenantInvoicesFresh`) and mail outbox suites. | `pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/ tests/unit/billing-settlement.service.test.ts tests/unit/billing-settlement.test.ts tests/unit/billing-settlement-statements.test.ts tests/unit/system-remediation/sr-invoice-001/ tests/unit/system-remediation/sr-qa-finance-001/ tests/unit/invoice-mail-20261004/` | `0` (`19 passed`, `108 tests`) | `.local/tenant-invoice-authoritative-read-20261015/impacted-regressions.log` |
| `tenant-invoice_exact-candidate-validation` | Package & root typecheck, package & test ESLint (`--max-warnings=0`), CI test coverage routing check (`tools/ci/check_test_coverage.py`), `@drts/api` billing unit tests, and original-before vs fixed-after verification on the exact candidate branch. | See Section 4 command table below | `0` | `.local/tenant-invoice-authoritative-read-20261015/*.log` |

---

## 4. Exact Validation Commands & Exit Codes

All commands were executed inside `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini2-tenant-invoice-authoritative-read-20261015` without starting any product development servers, preview servers, browser/E2E servers, or Docker Compose runtime:

| Check | Command | Exit Code | Summary | Log Path |
| --- | --- | --- | --- | --- |
| Original Base Reproduction (`ed70d73a03dd224e109867c99b7d04128484a3fe`) | `TENANT_INVOICE_SERVICE_MODULE_PATH="$PWD/.local/tenant-invoice-authoritative-read-20261015/original/apps/api/src/modules/billing-settlement/billing-settlement.service.ts" pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/` | `1` (expected pre-fix failure) | `4 failed \| 4 passed (8)` — reproduces 1-line partial invoice issuance | `.local/tenant-invoice-authoritative-read-20261015/original-before-fix.log` |
| Fixed Candidate Task Suite | `pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/` | `0` | `1 passed (1)`, `8 passed (8)` | `.local/tenant-invoice-authoritative-read-20261015/fixed-after.log` |
| Impacted Regression Suites (`SR-INVOICE-001`, `SR-QA-FINANCE-001`, `INVOICE-MAIL-20261004`, Billing Statements/Service) | `pnpm exec vitest run tests/unit/tenant-invoice-authoritative-read-20261015/ tests/unit/billing-settlement.service.test.ts tests/unit/billing-settlement.test.ts tests/unit/billing-settlement-statements.test.ts tests/unit/system-remediation/sr-invoice-001/ tests/unit/system-remediation/sr-qa-finance-001/ tests/unit/invoice-mail-20261004/` | `0` | `19 passed (19)`, `108 passed (108)` | `.local/tenant-invoice-authoritative-read-20261015/impacted-regressions.log` |
| `@drts/api` Package Billing Unit Suite | `pnpm --filter @drts/api exec vitest run tests/unit/billing-settlement.service.test.ts tests/unit/billing-settlement.controller.test.ts` | `0` | `2 passed (2)`, `19 passed (19)` | `.local/tenant-invoice-authoritative-read-20261015/api-billing-unit.log` |
| `@drts/api` Package Typecheck | `pnpm --filter @drts/api typecheck` | `0` | `tsc --noEmit` clean | `.local/tenant-invoice-authoritative-read-20261015/api-typecheck.log` |
| Root Workspace Typecheck | `pnpm typecheck:root` | `0` | `tsc -p tsconfig.json --noEmit` clean | `.local/tenant-invoice-authoritative-read-20261015/root-typecheck.log` |
| `@drts/api` Package ESLint | `pnpm --filter @drts/api lint` | `0` | `eslint "src/**/*.ts" "tests/**/*.ts" --max-warnings=0` clean | `.local/tenant-invoice-authoritative-read-20261015/api-lint.log` |
| New Regression Suite ESLint | `pnpm exec eslint tests/unit/tenant-invoice-authoritative-read-20261015/ --max-warnings=0` | `0` | `0` errors, `0` warnings | `.local/tenant-invoice-authoritative-read-20261015/root-test-lint.log` |
| CI Test Coverage Routing Check | `python3 tools/ci/check_test_coverage.py` | `0` | All `98` discovered test files routed | `.local/tenant-invoice-authoritative-read-20261015/check-test-coverage.log` |

---

## 5. Scope Discipline & Honest Open Boundaries

- **Write Scope Compliance**: Only modified the three authorized paths (`apps/api/src/modules/billing-settlement/billing-settlement.service.ts`, `tests/unit/tenant-invoice-authoritative-read-20261015/tenant-invoice-authoritative-read.test.ts`, and `docs/04-uat/system-remediation-20260906/TENANT-INVOICE-AUTHORITATIVE-READ-20261015.md`). No SQL query/schema rewrites, rate/tax/refund/provider policy edits, Demo producer/SDK changes, or mail harness edits were made.
- **Dependent C080 Coordination**: Original C080 workflow task shares `apps/api/src/modules/billing-settlement/billing-settlement.service.ts` as a downstream dependent; this fix keeps the diff minimal and localized to the tenant-invoice authoritative trip read hunk so C080 can cleanly adopt it after `DONE`/merge.
- **Four Own Source Keys Only**: This task claims only its four assigned Source acceptance keys (`tenant-invoice_authoritative-read-failure-refuses-partial-issuance`, `tenant-invoice_actual-complete-source-and-recovery-calculation`, `tenant-invoice_original-offline-driver-scope-and-artifact-regressions`, `tenant-invoice_exact-candidate-validation`). It does **not** claim real PostgreSQL/Cloud Run runtime occurrence, live SMTP/inbox delivery, whole `C077`–`C079` closure, or Final release-gate completion, which remain honestly open for their dedicated live/runtime/release verification stages.
