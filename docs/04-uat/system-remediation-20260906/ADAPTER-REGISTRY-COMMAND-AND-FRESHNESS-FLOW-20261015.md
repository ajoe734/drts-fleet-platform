# UAT & Remediation Evidence: `ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015`

- **Task ID**: `ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015`
- **Title**: 完成轉接器治理真命令、持久化回讀與到期刷新
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch (R2 Successor)**: `gemini/adapter-registry-command-and-freshness-flow-20261015-r2` (prior R1 branch `gemini/adapter-registry-command-and-freshness-flow-20261015` preserved untouched at `4b6c42b015b40ee7f05e6fc9bfabfa4102fb3e5f`, PR #2682)
- **Base Commit (`origin/dev`)**: `409bad360e89ec4e8e6e48c337f42295e15210d8` (R1 base: `62bd0fee263d01152d61a4bcc1eb31e1b47ebced`)
- **Pre-Fix Anchor Commit**: `3b3d74a83ea5e40c97f24c76a62b97a2542bffd1`
- **R1 Candidate Commit**: `4b6c42b015b40ee7f05e6fc9bfabfa4102fb3e5f` (PR #2682)
- **R2 Implementation Commit**: `b86a4d9930e0b677c62996f12fa430320d940c94`
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1026-platform-frontier-root/ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015.task-spec.json`
- **Audited Source Baselines**: `docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md`, `docs/04-uat/system-remediation-20260906/SR-QA-GOVERNANCE-001.md`

---

## 1. AI_COLLABORATION_GUIDE §0.7 Defect Reproduction, Fix Boundary, and Before/After Evidence

| Finding ID | Audited Defect Summary | Pre-Fix Reproduction (`before.log` @ `3b3d74a83ea5e40c97f24c76a62b97a2542bffd1`) | Fix Boundary & Implementation | Post-Fix Verification (`after.log`) |
| --- | --- | --- | --- | --- |
| **`C104-F1`** | `Register adapter` CTA on `/adapter-registry` only called `queueGovernedAction` (displaying an informational flash message) and never opened a registration form or issued `POST /api/platform-admin/adapters`. | `FAIL C104-F1`: `Unable to find an element by: [data-testid="adapter-register-modal"]` after clicking `註冊轉接器`; `POST /api/platform-admin/adapters` count was `0`. | Added task-local typed helper `registerPlatformAdapterCommand` in `apps/platform-admin-web/app/adapter-registry/adapter-registry-client.ts` (reusing public `ApiClient.post` without editing `@drts/sdk`) and governed registration modal in `apps/platform-admin-web/app/adapter-registry/page.tsx`. Populates `<select>` options directly from `@drts/contracts` (`Environment`, `AdapterType`, `RolloutStatus`, `FinanceAuthorityMode`), validates required fields, positive policy thresholds, webhook URL, and `credentialExpiry.reference`, awaits canonical `POST /api/platform-admin/adapters` ACK, updates/refetches authoritative list state, and renders `rev 1` plus server-evaluated `credentialExpiryWarning`. | `PASS C104-F1`: submits canonical `POST /api/platform-admin/adapters` with `@drts/contracts` enum values, receives `201`/canonical envelope ACK, and renders the newly registered adapter card with `rev 1`, `credentialExpiry.reference`, and server-computed `credentialExpiryWarning.state = "ok"`. |
| **`C104-F2`** | `Edit config` and `Edit credential` CTAs on `/adapter-registry` only called `queueGovernedAction` without opening forms or issuing `PATCH /api/platform-admin/adapters/:adapterId`. | `FAIL C104-F2`: `Unable to find an element by: [data-testid="adapter-config-modal"]` after clicking `編輯設定`; `PATCH /api/platform-admin/adapters/:id` count was `0`. | Added governed configuration modal (`config`, `rolloutStatus`, `rolloutStage`, `policies`, `webhookStatus`, `featureFlags`, required operator `reason` — with `<select>` options bound to `@drts/contracts` `RolloutStatus`, `Environment`, and `FinanceAuthorityMode`) and credential reference/expiry modal (`credentialExpiry.reference`, `credentialExpiry.expiresAt`, required operator `reason`) in `apps/platform-admin-web/app/adapter-registry/page.tsx`, invoking `updatePlatformAdapterCommand` (`PATCH /api/platform-admin/adapters/:id`) with `expectedRevision` and `reason`. Preserved `Rotate credential` (`輪替憑證`) as an honest governance notice that never fabricates a provider secret rotation `PATCH`, and preserved existing enable/disable control with production confirmation and operator reason. | `PASS C104-F2`: `Edit config` and `Edit credential` submit canonical `PATCH` payloads with `@drts/contracts` enum values (`RolloutStatus.CANARY`, `Environment.STAGING`, `FinanceAuthorityMode.PLATFORM_MANAGED`), `expectedRevision: 1 -> 2 -> 3`, and operator `reason`, render updated `rev` and `lastMutationAudit` server evidence, keep `Rotate credential` free of fake `PATCH` calls, and verify `disableAdapter` toggle `PATCH`. |
| **`C104-F3`** | `PlatformAdminService.registerPlatformAdapter` was synchronous and mutated `this.adapters` before `void this.persistAdapterRegistration(newRecord)` and `this.recordAdapterAudit(...)`; `updatePlatformAdapter` mutated `this.adapters[index]` before `await this.persistAdapterMutation(...)` and `void this.persistAdapterRegistration(...)`, swallowing generic DB errors after reporting persistence failure and returning `2xx` with a dirty in-memory cache. | `FAIL C104-F3`: When an enabled `PlatformAdminRepository` rejected `persistChanges` with `PG_WRITE_REJECTED_ON_REGISTER`, `POST /api/platform-admin/adapters` still returned `201` (`registerRejectedRes.status === 201`, expected `>= 500`) and polluted `this.adapters`. | Made `PlatformAdminService.registerPlatformAdapter` `async` in `apps/api/src/modules/platform-admin/platform-admin.service.ts` and awaited it in both direct and `idempotencyService.execute` paths in `apps/api/src/modules/platform-admin/platform-admin.controller.ts`. Both `registerPlatformAdapter` and `updatePlatformAdapter` now validate command inputs (including `@drts/contracts` enum fields `environment`, `rolloutStage`, `adapterType`, `rolloutStatus`, `credentialStatus`, and `policies.financeAuthorityMode`), await durable repository persistence (`persistAdapterRegistration` / `persistAdapterMutation`) when `this.platformAdminRepository?.isEnabled()`, and await `recordAdapterAudit` (`recordAuditLogAsync`) **before** mutating `this.adapters` or returning a `2xx` ACK. Generic DB/audit errors propagate honestly after reporting persistence failure; `PlatformAdapterRevisionConflictError` continues to map to `409 PLATFORM_ADAPTER_REVISION_CONFLICT`. Adapted the two direct `registerPlatformAdapter` fixtures in `sr-admin-adapter-001.test.ts` and `c104-c105-platform-adapter-registry.test.ts` to `await` and replaced the old best-effort-success expectation only at the repaired durable ACK boundary. | `PASS C104-F3` + `PASS sr-admin-adapter-001.test.ts` (11/11) + `PASS c104-c105-platform-adapter-registry.test.ts` (5/5): rejected create/update/audit writes return `500`/`409` without mutating `this.adapters` or emitting false success receipts; subsequent recovery persists and reloads cleanly. |
| **`C105-F1`** | `/adapter-registry` fetched `client.getPlatformAdapters()` only once inside `useEffect(..., [client, copy.loadError])` and had no mounted `T4` (`30_000ms`) refresh loop, visibility/focus re-entry trigger, in-flight deduplication, or unmount cleanup. | `FAIL C105-F1`: Advancing fake timers by `30_000ms` across `ok -> warning -> expired` windows produced `1` total `GET /api/platform-admin/adapters` request (expected `2`), leaving the mounted card stuck on its initial state and `evaluatedAt`. | Wired `ADAPTER_REGISTRY_REFRESH_INTERVAL_MS` (`30_000`) and `ADAPTER_REGISTRY_REFRESH_TIER` (`"medium_slow"`, matching `REFRESH_POLICIES.adapterRegistry`) in `apps/platform-admin-web/app/adapter-registry/page.tsx` with `window.setInterval`, `document` `visibilitychange` + `window` `focus` refresh triggers when visible, `inFlightRefreshRef` request deduplication, `requestSeqRef`/`latestAppliedSeqRef` monotonic ordering guard (updated on both list refreshes and local mutation ACKs) against stale overwrites, and `mountedRef` + interval/`visibilitychange`/`focus` listener cleanup on unmount. Distinguished real `unknown` expiry from failed/denied refresh (`data-testid="adapter-refresh-error-banner"` preserves last known authoritative cards without fabricating a new expiry conclusion). | `PASS C105-F1` + `PASS distinguishes real unknown expiry from failed/denied refresh...`: mounted page transitions `ok -> warning -> expired` across 30s ticks with updated server `evaluatedAt`, triggers refresh on `window` `focus`, deduplicates slow overlapping refreshes, discards stale out-of-order responses resolved after a newer mutation/forced refresh, and cleans up timers and `visibilitychange`/`focus` listeners on unmount. |

---

## 2. R1 Reopen Findings & R2 Remediation Summary (`Gemini2` Review @ `2026-10-15T15:55:47Z`)

| R1 Reopen Item | Root Cause in R1 (`4b6c42b015b4`) | R2 Fix & Verification on `gemini/adapter-registry-command-and-freshness-flow-20261015-r2` |
| --- | --- | --- |
| **1. CI `Commit trailers` gate failure** | Commits `3b3d74a83ea5` and `4b6c42b015b4` on `gemini/adapter-registry-command-and-freshness-flow-20261015` omitted `Task-ID:`, `LLM-Agent:`, and `Reviewer:` trailers required by `tools/ci/git/check_commit_trailers.py`. | Cut clean successor branch `gemini/adapter-registry-command-and-freshness-flow-20261015-r2` from `origin/dev` (`409bad360e89ec4e8e6e48c337f42295e15210d8`) without force-pushing, amending, or rebasing published branch `gemini/adapter-registry-command-and-freshness-flow-20261015`. Formatted commit subject (`ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015: ...`) and trailers (`LLM-Agent: gemini`, `Task-ID: ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015`, `Reviewer: Gemini2`) and verified `python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD` exits `0`. |
| **2. Contract enum mismatch in `page.tsx` & service enum validation** | Register and config modals in `page.tsx` had hardcoded `<option>` values (`PREPROD`, `HYBRID`, `HYBRID_SETTLEMENT`, `ROLLED_BACK`) that differed from `@drts/contracts` (`Environment`, `AdapterType`, `RolloutStatus`, `FinanceAuthorityMode`), and `PlatformAdminService` did not validate enum fields at runtime. | Bound all 7 `<select>` controls in `apps/platform-admin-web/app/adapter-registry/page.tsx` to `Object.values(Environment)`, `Object.values(AdapterType)`, `Object.values(RolloutStatus)`, and `Object.values(FinanceAuthorityMode)` from `@drts/contracts`. Added `assertValidEnum` in `PlatformAdminService` (`validateRegisterPlatformAdapterInput`, `validateUpdatePlatformAdapterCommand`, `validateAdapterPoliciesInput`) for `environment`, `rolloutStage`, `adapterType`, `rolloutStatus`, `credentialStatus`, and `policies.financeAuthorityMode`. Added UI `<option>` + enum round-trip assertions in `C104-F1`/`C104-F2` and service enum rejection assertions in `adapter-registry-command-and-freshness-flow.test.tsx`. |
| **3. Out-of-order slow-response regression, `focus` listener cleanup, and separate-commit non-rollback boundary** | The C105 test covered in-flight deduplication across ticks but did not resolve an older slow `GET` after a newer mutation/forced refresh completed; `page.tsx` registered `visibilitychange` without `window` `focus`; and the non-rollback boundary between `PlatformAdminRepository` and `AuditNotificationService` needed explicit code + UAT documentation. | Added `window.addEventListener("focus", ...)` + unmount cleanup in `page.tsx` and updated `upsertLocalAdapter` to advance `latestAppliedSeqRef.current = ++requestSeqRef.current`. Expanded `C105-F1` to assert `window` `focus` refresh and post-unmount `focus`/`visibilitychange` cleanup, and expanded the second C105 test to hold a slow `GET` (`revision = 1`, `25s`) open while a newer config `PATCH` + forced `GET` (`revision = 2`, `55s`) completes first, then resolve the stale `GET` out-of-order and verify `latestAppliedSeqRef` preserves `revision = 2` and `55s`. Documented the explicit separate-commit non-rollback boundary in `platform-admin.service.ts` and Section 5 below. |

---

## 3. Acceptance Key Mapping

1. **`adapter-registry_complete-governed-commands-and-canonical-ACK-readback`**
   - Implemented real registration (`POST /api/platform-admin/adapters`), configuration (`PATCH /api/platform-admin/adapters/:id`), and credential-reference/expiry (`PATCH /api/platform-admin/adapters/:id`) forms plus existing enable/disable control on `/adapter-registry`, using canonical `@drts/contracts` enum options (`Environment`, `AdapterType`, `RolloutStatus`, `FinanceAuthorityMode`).
   - Reused `ApiClient.post` in task-local `apps/platform-admin-web/app/adapter-registry/adapter-registry-client.ts` without modifying Demo-owned `@drts/sdk`.
   - Enforced durable repository write + `recordAuditLogAsync` completion before in-memory `this.adapters` mutation or `2xx` ACK in `PlatformAdminService.registerPlatformAdapter` and `PlatformAdminService.updatePlatformAdapter`, awaiting `registerPlatformAdapter` in both `PlatformAdminController` paths.
2. **`adapter-registry_T4-freshness-expiry-and-honest-refresh`**
   - Connected `/adapter-registry` to the canonical `T4` (`30_000ms`) refresh cadence (`ADAPTER_REGISTRY_REFRESH_INTERVAL_MS = 30_000`, `ADAPTER_REGISTRY_REFRESH_TIER = "medium_slow"`) with `visibilitychange` and `focus` re-entry, in-flight deduplication, monotonic response sequence ordering (`requestSeqRef` / `latestAppliedSeqRef`), and unmount cleanup.
   - Preserved server-owned 14-day warning window and `evaluatedAt` (`unknown`, `ok`, `warning`, `expired`) and distinguished a real `unknown` expiry from a failed/denied refresh check.
3. **`adapter-registry_original-role-negative-noDB-and-regressions`**
   - Added 7 socket-free production-path tests in `tests/unit/adapter-registry-command-and-freshness-flow-20261015/adapter-registry-command-and-freshness-flow.test.tsx` covering `C104-F1`, `C104-F2`, `C104-F3`, `C105-F1`, unknown-vs-failed/out-of-order slow-response refresh ordering, platform realm + `foundation:write` role/scope negative matrix, and deliberate noDB/demo mode + rejected audit propagation + contract enum and field validation.
   - Preserved all 11 tests in `tests/unit/system-remediation/sr-admin-adapter-001/sr-admin-adapter-001.test.ts` and all 5 tests in `tests/unit/system-remediation/sr-qa-governance-001/c104-c105-platform-adapter-registry.test.ts`.
4. **`adapter-registry_exact-candidate-validation`**
   - Verified unit suites, `@drts/api` typecheck, `@drts/platform-admin-web` typecheck, `i18n-guard`, `eslint --max-warnings=0`, `git diff --check`, and `tools/ci/git/check_commit_trailers.py` on the isolated branch `gemini/adapter-registry-command-and-freshness-flow-20261015-r2`.

---

## 4. Verification Commands & Exit Codes

All checks were executed in `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-adapter-registry-command-and-freshness-flow-20261015` without starting any VM dev/preview/HTTP/PG/browser/Docker servers:

1. **Pre-fix failure reproduction (anchored at `3b3d74a83ea5e40c97f24c76a62b97a2542bffd1`)**:
   - Command:
     ```bash
     npx vitest run tests/unit/adapter-registry-command-and-freshness-flow-20261015/adapter-registry-command-and-freshness-flow.test.tsx
     ```
   - Result: Exit `1` (`4 failed | 3 passed` — `C104-F1`, `C104-F2`, `C104-F3`, `C105-F1` all reproduced their exact audited failures).
   - Evidence log: `/home/lupin/workspace/drts-fleet-platform/.local/adapter-registry-command-and-freshness-flow-20261015/before.log`

2. **Post-fix unit & regression suites**:
   - Command:
     ```bash
     npx vitest run \
       tests/unit/system-remediation/sr-admin-adapter-001/sr-admin-adapter-001.test.ts \
       tests/unit/system-remediation/sr-qa-governance-001/c104-c105-platform-adapter-registry.test.ts \
       tests/unit/adapter-registry-command-and-freshness-flow-20261015/adapter-registry-command-and-freshness-flow.test.tsx
     ```
   - Result: Exit `0` (`3 passed (3)` test files, `23 passed (23)` tests: `sr-admin-adapter-001` 11/11, `c104-c105-platform-adapter-registry` 5/5, `adapter-registry-command-and-freshness-flow` 7/7).
   - Evidence log: `/home/lupin/workspace/drts-fleet-platform/.local/adapter-registry-command-and-freshness-flow-20261015/after.log`

3. **Workspace Typechecks**:
   - Command:
     ```bash
     pnpm --filter @drts/api typecheck && pnpm --filter @drts/platform-admin-web typecheck
     ```
   - Result: Exit `0` (`tsc -p tsconfig.json --noEmit` and `next-typecheck.sh` passed with 0 errors).

4. **i18n Guard**:
   - Command:
     ```bash
     node tools/ci/i18n-guard.mjs
     ```
   - Result: Exit `0` (`i18n-guard: OK (648 files scanned across 11 apps, 81 exemption(s) from i18n-guard-baseline.json)`).

5. **ESLint (`--max-warnings=0`) & Git Whitespace Check**:
   - Command:
     ```bash
     npx eslint --max-warnings=0 \
       apps/api/src/modules/platform-admin/platform-admin.service.ts \
       apps/api/src/modules/platform-admin/platform-admin.controller.ts \
       apps/platform-admin-web/app/adapter-registry/adapter-registry-client.ts \
       apps/platform-admin-web/app/adapter-registry/page.tsx \
       apps/platform-admin-web/lib/translations.ts \
       tests/unit/system-remediation/sr-admin-adapter-001/sr-admin-adapter-001.test.ts \
       tests/unit/system-remediation/sr-qa-governance-001/c104-c105-platform-adapter-registry.test.ts \
       tests/unit/adapter-registry-command-and-freshness-flow-20261015/adapter-registry-command-and-freshness-flow.test.tsx && \
     git diff --check
     ```
   - Result: Exit `0` (0 errors, 0 warnings).

6. **Commit Trailers Gate**:
   - Command:
     ```bash
     python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD
     ```
   - Result: Exit `0` (`Commit trailers OK`).

---

## 5. Test-Credit Boundaries & Honesty Limitations

- **Separate-Commit Persistence vs. Audit-Log Non-Rollback Boundary**:
  - For `updatePlatformAdapter`, `PlatformAdminRepository.mutateAdapterWithAudit` commits the updated `platform_adapters` row and the `platform_adapter_mutation_audits` row atomically inside a single PostgreSQL transaction (`BEGIN ... COMMIT`). For `registerPlatformAdapter`, `PlatformAdminRepository.persistChanges` commits the new `platform_adapters` row in its own repository write.
  - Subsequently, `PlatformAdminService.recordAdapterAudit` awaits `AuditNotificationService.recordAuditLogAsync`, which appends to the separate audit-notification log stream outside the `PlatformAdminRepository` transaction.
  - Because global audit/persistence policy and SQL are outside this task's scope, if `PlatformAdminRepository` commits its transaction and the subsequent separate `recordAuditLogAsync` call rejects, the HTTP request fails honestly (`5xx`), `this.adapters` in-memory cache is **not** advanced to claim a completed command + audit ACK, and no false `2xx` success receipt is returned — **however, the already-committed `PlatformAdminRepository` database transaction is not rolled back across the separate service boundary**. Neither the service code nor this UAT claims cross-service transactional rollback when `recordAuditLogAsync` fails after a committed repository write.
- **Metadata Governance vs. Provider Secret Rotation**: This task completes the governed `POST /api/platform-admin/adapters` registration flow, `PATCH /api/platform-admin/adapters/:adapterId` configuration and non-secret `credentialExpiry` (`reference` + `expiresAt`) update flows, durable repository/audit ACK ordering, and mounted `T4` (`30s`) freshness refresh on `/adapter-registry`. Updating `credentialExpiry.reference` or `credentialExpiry.expiresAt` via `PATCH` records non-secret pointer metadata and server-evaluated expiry warnings; it is **not** proof that external provider key/secret material was rotated in a live third-party provider or KMS/Secret Manager. The `Rotate credential` (`輪替憑證`) button intentionally remains an explicit governance notice and never fabricates a simulated rotation `PATCH`.
- **Source Scope vs. Hosted/Live Cap**: Completion of this task satisfies the four task-owned Source acceptance keys (`adapter-registry_complete-governed-commands-and-canonical-ACK-readback`, `adapter-registry_T4-freshness-expiry-and-honest-refresh`, `adapter-registry_original-role-negative-noDB-and-regressions`, `adapter-registry_exact-candidate-validation`). It does **not** claim full C104/C105 hosted/live provider delivery, `full134` Source completion, the original Final two keys, or whole-goal completion.
