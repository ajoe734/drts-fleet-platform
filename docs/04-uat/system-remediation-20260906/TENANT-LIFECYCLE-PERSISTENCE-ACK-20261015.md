# UAT & Remediation Evidence: `TENANT-LIFECYCLE-PERSISTENCE-ACK-20261015`

- **Task ID**: `TENANT-LIFECYCLE-PERSISTENCE-ACK-20261015`
- **Finding ID**: `C102-TENANT-LIFECYCLE-CANONICAL-WRITE-ACK`
- **Capability**: `C102` (Tenant Directory, Lifecycle, Onboarding, Rollout Stage, Role Invite/Ack, Rollback Hold, Settings/Quota/Modules)
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/tenant-lifecycle-persistence-ack-20261015`
- **Base Commit (`origin/dev`)**: `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`

---

## 1. Executive Summary & Root Cause Analysis

### Defect (`C102-TENANT-LIFECYCLE-CANONICAL-WRITE-ACK`)

In `apps/api/src/modules/platform-admin/tenants.service.ts` and `apps/api/src/modules/platform-admin/tenants.controller.ts`:

1. **Fire-and-forget canonical persistence**: `TenantsService.persistChanges(...)` invoked `void this.platformAdminRepository.persistChanges(changes).catch(...)`, discarding the returned Promise and swallowing canonical PostgreSQL write failures inside `reportPersistenceFailure(error, context)` without propagating the rejection to the caller.
2. **Premature cache mutation and success audit publication**: All 8 public mutators (`create`, `updateSettings`, `updateOnboarding`, `inviteRole`, `acknowledgeRole`, `setRollbackHold`, `setRolloutStage`, `setStatus`) mutated `this.tenants` (either via `this.tenants.set(...)` or by mutating the live cached object returned by `this.requireTenant(tenantId)` in-place), emitted success audit entries via `this.recordAudit(...)`, and returned synchronously before `PlatformAdminRepository.persistChanges(...)` settled.
3. **Un-awaited controller envelopes**: All 9 mutating handlers in `TenantsController` (`create`, `updateSettings`, `updateOnboarding`, `setRolloutStage`, `inviteRole`, `acknowledgeRole`, `rollbackHold`, `suspend`, `activate`) returned `{ data: this.tenantsService.<mutator>(...) }` synchronously without awaiting canonical persistence.
4. **Un-awaited startup persistence helpers**: `TenantsService.onModuleInit()` invoked `this.persistChanges(...)` for `"module init bootstrap"` and `"module init strict auth sanitize"` without awaiting settlement.

---

## 2. Before-Fix Reproduction vs. After-Fix Verification

### Before-Fix Reproduction (on unmodified base `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`)

Command:

```bash
pnpm vitest run tests/unit/tenant-lifecycle-persistence-ack-20261015/tenant-lifecycle-persistence-ack.test.ts
```

Actual result on unmodified code (**Exit Code 1**, 4 failed tests):

- `keeps all 8 TenantsService mutators and all 9 TenantsController handlers pending while canonical persistChanges is deferred, without mutating cache or recording success audit early`:
  `AssertionError: expected true to be false` — `controller.create(...)` resolved immediately while the repository `persistChanges` deferred Promise was still pending.
- `awaits startup persistence in onModuleInit while preserving non-fatal startup fallback when repository rejects`:
  `AssertionError: expected false to be true` — `onModuleInit()` resolved before `bootstrapDeferred.promise` settled.
- `propagates canonical persistence rejection across all 9 controller actions, preserves prior committed state/readback, suppresses premature success audits, and allows clean retry without clobbering sibling tenants`:
  `AssertionError: expected { data: { id: 'tenant-retryable-corp', …(18) } } to be an instance of Promise` — `controller.create(...)` returned a synchronous `{ data: TenantRecord }` envelope instead of a rejecting Promise when `persistChanges` rejected.

### After-Fix Verification

Command:

```bash
pnpm vitest run tests/unit/tenant-lifecycle-persistence-ack-20261015/tenant-lifecycle-persistence-ack.test.ts
```

Actual result after remediation (**Exit Code 0**, 4/4 tests passed).

---

## 3. §0.7 Per-Item Fix & Verification Matrix

| Finding／驗收項                                                                                                | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                                                                                                                              | 舊版重現 → 修正版結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                                                        | 未驗項與具體限制                                                                                                                                                                   |
| :------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `C102-TENANT-LIFECYCLE-CANONICAL-WRITE-ACK` / `tenant-lifecycle_eight-mutators-nine-controllers-canonical-ack` | `apps/api/src/modules/platform-admin/tenants.service.ts` (`onModuleInit`:150-179, `create`:199-259, `updateSettings`:261-312, `updateOnboarding`:314-463, `inviteRole`:465-513, `acknowledgeRole`:515-567, `setRollbackHold`:569-607, `setRolloutStage`:609-694, `setStatus`:696-729, `persistChanges`:1148-1161); `apps/api/src/modules/platform-admin/tenants.controller.ts` (9 async mutating handlers:31-138) | 舊版 (`df77ae358`)：`persistChanges` 使用 `void ... .catch(...)` 吞掉 Promise，controller 同步回傳 `{ data }`，在 `persistChanges` deferred 尚未 resolve 時即提前完成（**Exit 1**） → 修正版：8 個 service mutators 與 9 個 controller handlers 皆 `await` 寫入完成且 envelope `data` 絕不包裹 Promise；`onModuleInit` 亦 `await` 啟動寫入並保留非致命啟動語義（**Exit 0**）                                                                                                                    | `pnpm vitest run tests/unit/tenant-lifecycle-persistence-ack-20261015/tenant-lifecycle-persistence-ack.test.ts` → **Exit 0**（4 pass / 0 fail / 0 skip）；證據：`tests/unit/tenant-lifecycle-persistence-ack-20261015/tenant-lifecycle-persistence-ack.test.ts`         | Hosted CI / 真實 PG 跨節點驗收由 candidate lifecycle / hosted workflow 執行；本 VM 依 `AGENTS.md` 不啟動伺服器                                                                     |
| `tenant-lifecycle_failure-cache-audit-and-readback`                                                            | `apps/api/src/modules/platform-admin/tenants.service.ts` (`create`/`updateSettings`/`updateOnboarding`/`inviteRole`/`acknowledgeRole`/`setRollbackHold`/`setRolloutStage`/`setStatus`:199-729, `persistChanges`:1148-1161)                                                                                                                                                                                        | 舊版 (`df77ae358`)：`this.requireTenant(tenantId)` 回傳 map 內 live reference，mutators 直接 in-place 修改屬性並在寫入前呼叫 `recordAudit`，當寫入 pending 或 reject 時 `get`/`list` 讀回未落盤髒資料且吞掉錯誤（**Exit 1**） → 修正版：先於 `this.cloneTenant(current)` 複本驗證與套用變更，待 `await this.persistChanges(...)` 成功後才寫入 `this.tenants` 與 `recordAudit`；失敗時呼叫 `reportPersistenceFailure` 並向 caller 拋出錯誤，保留先前狀態且重試成功、不污染其他租戶（**Exit 0**） | `pnpm vitest run tests/unit/tenant-lifecycle-persistence-ack-20261015/tenant-lifecycle-persistence-ack.test.ts` → **Exit 0**（4 pass / 0 fail / 0 skip）                                                                                                                | Hosted CI 待 handoff 後於同 candidate SHA 收錄                                                                                                                                     |
| `tenant-lifecycle_original-guards-isolation-and-noDB`                                                          | `apps/api/src/modules/platform-admin/tenants.service.ts` (`create`:199-259, `updateSettings`:261-312, `acknowledgeRole`:515-567, `setRolloutStage`:609-694, `enforcePromotionGates`:731-810)                                                                                                                                                                                                                      | 舊版 (`df77ae358`)：同步阻擋邏輯在改為 async 後若順序不當可能誤觸寫入或遺漏 `reject_platform_tenant_rollout` 稽核 → 修正版：在呼叫 `persistChanges` 前完成租戶代碼唯一性、配額非負數、允許模組、角色邀請/確認、onboarding/stage 晉升與 `rollback_hold` 守衛（含阻擋稽核），保留跨租戶隔離與無 DB (`noDB`) 記憶體模式（**Exit 0**）                                                                                                                                                              | `pnpm -C apps/api exec vitest run tests/unit/tenants.service.test.ts` → **Exit 0**（15 pass / 0 fail / 0 skip）；`pnpm vitest run tests/unit/system-remediation/sr-qa-governance-001/c102-tenant-lifecycle-governance.test.ts` → **Exit 0**（6 pass / 0 fail / 0 skip） | 不涉及 `platform-admin.repository.ts` SQL 或定價/授權政策變更                                                                                                                      |
| `tenant-lifecycle_exact-candidate-validation`                                                                  | `apps/api/tests/unit/tenants.service.test.ts`:15-315; `tests/unit/system-remediation/sr-qa-governance-001/c102-tenant-lifecycle-governance.test.ts`:14-240; `tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts`:472-527; `tests/integ/tenant-governance-negative.test.ts`:134-166; `tests/e2e/system-remediation/sr-qa-tenant-001/appmodule-acceptance-seed.ts`:243-260        | 舊版 (`df77ae358`)：5 個既有測試與 seed caller 以同步方式呼叫 `TenantsService` mutators → 修正版：僅在核准的 5 個實際 caller 路徑與 C102 lifecycle 區塊做同語義 `async`/`await` 適配，保留所有業務、SQL 與負向斷言，未改動唯讀/`Object.create` 參考（**Exit 0**）                                                                                                                                                                                                                               | 見下方第 4 節完整命令（API 30 tests pass、Root 82 tests pass、Scoped `tsc --noEmit` 8 個 `write_scopes` TS 檔案與 `lint:root`、`@drts/api lint` 全數 **Exit 0**）                                                                                                       | `appmodule-acceptance-seed.ts` 僅做靜態型別與 lint 驗證；依 `AGENTS.md` 禁止在本 VM 啟動 E2E / PG / HTTP 服務；完整 monorepo `typecheck` 於 Hosted CI 乾淨 `node_modules` 環境執行 |

---

## 4. Executed Verification Commands & Exit Codes

1. **Impacted API Unit Tests**:

   ```bash
   pnpm -C apps/api exec vitest run tests/unit/tenants.service.test.ts tests/unit/platform-admin-assistant-read-tools.test.ts tests/unit/throttling.test.ts
   ```

   - Result: **Exit 0** (`3 passed` test files, `30 passed` tests).

2. **Root Unit, Integration & Security Regression Tests (including unmodified read-only / `Object.create` consumers)**:

   ```bash
   pnpm vitest run \
     tests/unit/tenant-lifecycle-persistence-ack-20261015/tenant-lifecycle-persistence-ack.test.ts \
     tests/unit/system-remediation/sr-qa-governance-001/c102-tenant-lifecycle-governance.test.ts \
     tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts \
     tests/unit/system-remediation/sr-qa-tenant-001/tenant-approval-and-quota-lifecycle.test.ts \
     tests/unit/tenant-default-authority.test.ts \
     tests/integ/tenant-governance-negative.test.ts \
     tests/security/iam-route-admin-negative.test.ts
   ```

   - Result: **Exit 0** (`7 passed` test files, `82 passed` tests).

3. **Lint (`lint:root` & `@drts/api lint`)**:

   ```bash
   pnpm lint:root && pnpm --filter @drts/api lint
   ```

   - Result: **Exit 0** (0 errors, 0 warnings).

4. **Typecheck (Workspace Contracts Build + Scoped `tsc --noEmit` on all 8 `write_scopes` TypeScript files & `AppModule` seed graph)**:
   ```bash
   pnpm --filter @drts/contracts build && pnpm --filter @drts/control-plane-auth build
   pnpm exec tsc -p <scoped-tsconfig-including-all-8-write-scope-ts-files> --noEmit
   ```

   - Result: **Exit 0** (0 errors across all 8 modified/created TypeScript files and their imported graph).
   - Honest note on unfiltered worktree `pnpm typecheck:root` / `pnpm --filter @drts/api typecheck`: In this isolated git worktree, `node_modules` is symlinked to `/home/lupin/workspace/drts-fleet-platform/node_modules`, causing unfiltered `tsc` to report pre-existing/worktree-symlink errors in unrelated files (`remote-smtp-mail.transport.ts` missing `nodemailer` symlink target in canonical `node_modules/.pnpm`, and dual-path `ApiClient` private property intersection in unrelated tests), with **0 errors** in any file touched by this task. Full clean-install typecheck runs in mandatory GitHub Actions CI on the candidate SHA.

---

## 5. Scope Compliance & Honest VM Execution Limits

- **Scope Compliance**: Only files explicitly listed in `write_scopes` were modified. For mixed-capability files, edits were strictly confined to the authorized C102 lifecycle hunks:
  - `tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts` (only the C102 lifecycle `describe` block starting at line 472)
  - `tests/integ/tenant-governance-negative.test.ts` (only the lifecycle `rollback_hold` test case at lines 134–166)
  - `tests/e2e/system-remediation/sr-qa-tenant-001/appmodule-acceptance-seed.ts` (only the `TenantsService.create` cast and `await` calls at lines 243–260)
- **Unmodified Read-Only / `Object.create` Callers**: `tests/unit/tenant-default-authority.test.ts`, `apps/api/src/modules/platform-admin/platform-admin.repository.ts`, `apps/api/src/modules/platform-admin/platform-admin.service.ts`, and `packages/sdk` were not modified.
- **VM Execution Boundary**: Per `AGENTS.md` VM restriction, no product development servers, HTTP preview servers, Playwright/browser E2E runners, or Docker Compose / PostgreSQL services were started on this VM. Adaptation of `tests/e2e/system-remediation/sr-qa-tenant-001/appmodule-acceptance-seed.ts` was verified via TypeScript (`tsc --noEmit`) and ESLint (`pnpm lint:root`).
