# UAT & Remediation Evidence: `ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015`

- **Task ID**: `ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015`
- **Title**: 完成轉接器治理真命令、持久化回讀與到期刷新
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/adapter-registry-command-and-freshness-flow-20261015`
- **Base Commit (`origin/dev`)**: `62bd0fee263d01152d61a4bcc1eb31e1b47ebced`
- **Pre-Fix Anchor Commit**: `3b3d74a83ea5e40c97f24c76a62b97a2542bffd1`
- **Initial Candidate Commit**: `800a5d74a95bc695383d5a65988e2715b33f6bb3`
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1026-platform-frontier-root/ADAPTER-REGISTRY-COMMAND-AND-FRESHNESS-FLOW-20261015.task-spec.json`
- **Audited Source Baselines**: `docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md`, `docs/04-uat/system-remediation-20260906/SR-QA-GOVERNANCE-001.md`

---

## 1. AI_COLLABORATION_GUIDE §0.7 Defect Reproduction, Fix Boundary, and Before/After Evidence

| Finding ID | Audited Defect Summary | Pre-Fix Reproduction (`before.log` @ `3b3d74a83ea5e40c97f24c76a62b97a2542bffd1`) | Fix Boundary & Implementation | Post-Fix Verification (`after.log`) |
| --- | --- | --- | --- | --- |
| **`C104-F1`** | `Register adapter` CTA on `/adapter-registry` only called `queueGovernedAction` (displaying an informational flash message) and never opened a registration form or issued `POST /api/platform-admin/adapters`. | `FAIL C104-F1`: `Unable to find an element by: [data-testid="adapter-register-modal"]` after clicking `註冊轉接器`; `POST /api/platform-admin/adapters` count was `0`. | Added task-local typed helper `registerPlatformAdapterCommand` in `apps/platform-admin-web/app/adapter-registry/adapter-registry-client.ts` (reusing public `ApiClient.post` without editing `@drts/sdk`) and governed registration modal in `apps/platform-admin-web/app/adapter-registry/page.tsx`. Validates required fields, positive policy thresholds, webhook URL, and `credentialExpiry.reference`, awaits canonical `POST /api/platform-admin/adapters` ACK, updates/refetches authoritative list state, and renders `rev 1` plus server-evaluated `credentialExpiryWarning`. | `PASS C104-F1` (`2758ms`): submits canonical `POST /api/platform-admin/adapters`, receives `201`/canonical envelope ACK, and renders the newly registered adapter card with `rev 1`, `credentialExpiry.reference`, and server-computed `credentialExpiryWarning.state = "ok"`. |
| **`C104-F2`** | `Edit config` and `Edit credential` CTAs on `/adapter-registry` only called `queueGovernedAction` without opening forms or issuing `PATCH /api/platform-admin/adapters/:adapterId`. | `FAIL C104-F2`: `Unable to find an element by: [data-testid="adapter-config-modal"]` after clicking `編輯設定`; `PATCH /api/platform-admin/adapters/:id` count was `0`. | Added governed configuration modal (`config`, `rolloutStatus`, `rolloutStage`, `policies`, `webhookStatus`, `featureFlags`, required operator `reason`) and credential reference/expiry modal (`credentialExpiry.reference`, `credentialExpiry.expiresAt`, required operator `reason`) in `apps/platform-admin-web/app/adapter-registry/page.tsx`, invoking `updatePlatformAdapterCommand` (`PATCH /api/platform-admin/adapters/:id`) with `expectedRevision` and `reason`. Preserved `Rotate credential` (`輪替憑證`) as an honest governance notice that never fabricates a provider secret rotation `PATCH`, and preserved existing enable/disable control with production confirmation and operator reason. | `PASS C104-F2` (`2433ms`): `Edit config` and `Edit credential` submit canonical `PATCH` payloads with `expectedRevision: 1 -> 2 -> 3` and operator `reason`, render updated `rev` and `lastMutationAudit` server evidence, keep `Rotate credential` free of fake `PATCH` calls, and verify `disableAdapter` toggle `PATCH`. |
| **`C104-F3`** | `PlatformAdminService.registerPlatformAdapter` was synchronous and mutated `this.adapters` before `void this.persistAdapterRegistration(newRecord)` and `this.recordAdapterAudit(...)`; `updatePlatformAdapter` mutated `this.adapters[index]` before `await this.persistAdapterMutation(...)` and `void this.persistAdapterRegistration(...)`, swallowing generic DB errors after reporting persistence failure and returning `2xx` with a dirty in-memory cache. | `FAIL C104-F3`: When an enabled `PlatformAdminRepository` rejected `persistChanges` with `PG_WRITE_REJECTED_ON_REGISTER`, `POST /api/platform-admin/adapters` still returned `201` (`registerRejectedRes.status === 201`, expected `>= 500`) and polluted `this.adapters`. | Made `PlatformAdminService.registerPlatformAdapter` `async` in `apps/api/src/modules/platform-admin/platform-admin.service.ts` and awaited it in both direct and `idempotencyService.execute` paths in `apps/api/src/modules/platform-admin/platform-admin.controller.ts`. Both `registerPlatformAdapter` and `updatePlatformAdapter` now validate command inputs, await durable repository persistence (`persistAdapterRegistration` / `persistAdapterMutation`) when `this.platformAdminRepository?.isEnabled()`, and await `recordAdapterAudit` (`recordAuditLogAsync`) **before** mutating `this.adapters` or returning a `2xx` ACK. Generic DB/audit errors propagate honestly after reporting persistence failure; `PlatformAdapterRevisionConflictError` continues to map to `409 PLATFORM_ADAPTER_REVISION_CONFLICT`. Adapted the two direct `registerPlatformAdapter` fixtures in `sr-admin-adapter-001.test.ts` and `c104-c105-platform-adapter-registry.test.ts` to `await` and replaced the old best-effort-success expectation only at the repaired durable ACK boundary. | `PASS C104-F3` + `PASS sr-admin-adapter-001.test.ts` (11/11) + `PASS c104-c105-platform-adapter-registry.test.ts` (5/5): rejected create/update/audit writes return `500`/`409` without mutating `this.adapters` or emitting false success receipts; subsequent recovery persists and reloads cleanly. |
| **`C105-F1`** | `/adapter-registry` fetched `client.getPlatformAdapters()` only once inside `useEffect(..., [client, copy.loadError])` and had no mounted `T4` (`30_000ms`) refresh loop, visibility/focus re-entry trigger, in-flight deduplication, or unmount cleanup. | `FAIL C105-F1`: Advancing fake timers by `30_000ms` across `ok -> warning -> expired` windows produced `1` total `GET /api/platform-admin/adapters` request (expected `2`), leaving the mounted card stuck on its initial state and `evaluatedAt`. | Wired `ADAPTER_REGISTRY_REFRESH_INTERVAL_MS` (`REFRESH_POLICIES.adapterRegistry.intervalMs = 30_000`) in `apps/platform-admin-web/app/adapter-registry/page.tsx` with `window.setInterval`, `visibilitychange`/`focus` refresh triggers when visible, `inFlightRefreshRef` request deduplication, `requestSeqRef`/`latestAppliedSeqRef` monotonic ordering guard against stale overwrites, and `mountedRef` + interval/listener cleanup on unmount. Distinguished real `unknown` expiry from failed/denied refresh (`data-testid="adapter-refresh-error-banner"` preserves last known authoritative cards without fabricating a new expiry conclusion). | `PASS C105-F1` (`990ms`) + `PASS distinguishes real unknown expiry from failed/denied refresh...` (`571ms`): mounted page transitions `ok -> warning -> expired` across 30s ticks with updated server `evaluatedAt`, deduplicates slow overlapping refreshes, ignores stale out-of-order responses, and cleans up timers/listeners on unmount. |

---

## 2. Acceptance Key Mapping

1. **`adapter-registry_complete-governed-commands-and-canonical-ACK-readback`**
   - Implemented real registration (`POST /api/platform-admin/adapters`), configuration (`PATCH /api/platform-admin/adapters/:id`), and credential-reference/expiry (`PATCH /api/platform-admin/adapters/:id`) forms plus existing enable/disable control on `/adapter-registry`.
   - Reused `ApiClient.post` in task-local `apps/platform-admin-web/app/adapter-registry/adapter-registry-client.ts` without modifying Demo-owned `@drts/sdk`.
   - Enforced durable repository write + `recordAuditLogAsync` completion before in-memory `this.adapters` mutation or `2xx` ACK in `PlatformAdminService.registerPlatformAdapter` and `PlatformAdminService.updatePlatformAdapter`, awaiting `registerPlatformAdapter` in both `PlatformAdminController` paths.
2. **`adapter-registry_T4-freshness-expiry-and-honest-refresh`**
   - Connected `/adapter-registry` to the canonical `T4` (`30_000ms`) refresh policy (`REFRESH_POLICIES.adapterRegistry`) with visibility/focus re-entry, in-flight deduplication, monotonic response sequence ordering, and unmount cleanup.
   - Preserved server-owned 14-day warning window and `evaluatedAt` (`unknown`, `ok`, `warning`, `expired`) and distinguished a real `unknown` expiry from a failed/denied refresh check.
3. **`adapter-registry_original-role-negative-noDB-and-regressions`**
   - Added 7 socket-free production-path tests in `tests/unit/adapter-registry-command-and-freshness-flow-20261015/adapter-registry-command-and-freshness-flow.test.tsx` covering `C104-F1`, `C104-F2`, `C104-F3`, `C105-F1`, unknown-vs-failed/stale refresh ordering, platform realm + `foundation:write` role/scope negative matrix (rejecting unauthenticated, display-persona header without bearer token, tenant-realm token, and read-only `platform_auditor` token), and deliberate noDB/demo mode + rejected audit propagation + input validation.
   - Preserved all 11 tests in `tests/unit/system-remediation/sr-admin-adapter-001/sr-admin-adapter-001.test.ts` and all 5 tests in `tests/unit/system-remediation/sr-qa-governance-001/c104-c105-platform-adapter-registry.test.ts`.
4. **`adapter-registry_exact-candidate-validation`**
   - Verified unit suites, `@drts/api` typecheck, `@drts/platform-admin-web` typecheck, `i18n-guard`, `eslint --max-warnings=0`, `git diff --check`, and canonical consistency check on the isolated branch `gemini/adapter-registry-command-and-freshness-flow-20261015`.

---

## 3. Verification Commands & Exit Codes

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

---

## 4. Test-Credit Boundaries & Honesty Limitations

- **Metadata Governance vs. Provider Secret Rotation**: This task completes the governed `POST /api/platform-admin/adapters` registration flow, `PATCH /api/platform-admin/adapters/:adapterId` configuration and non-secret `credentialExpiry` (`reference` + `expiresAt`) update flows, durable repository/audit ACK ordering, and mounted `T4` (`30s`) freshness refresh on `/adapter-registry`. Updating `credentialExpiry.reference` or `credentialExpiry.expiresAt` via `PATCH` records non-secret pointer metadata and server-evaluated expiry warnings; it is **not** proof that external provider key/secret material was rotated in a live third-party provider or KMS/Secret Manager. The `Rotate credential` (`輪替憑證`) button intentionally remains an explicit governance notice and never fabricates a simulated rotation `PATCH`.
- **Source Scope vs. Hosted/Live Cap**: Completion of this task satisfies the four task-owned Source acceptance keys (`adapter-registry_complete-governed-commands-and-canonical-ACK-readback`, `adapter-registry_T4-freshness-expiry-and-honest-refresh`, `adapter-registry_original-role-negative-noDB-and-regressions`, `adapter-registry_exact-candidate-validation`). It does **not** claim full C104/C105 hosted/live provider delivery, `full134` Source completion, the original Final two keys, or whole-goal completion.
