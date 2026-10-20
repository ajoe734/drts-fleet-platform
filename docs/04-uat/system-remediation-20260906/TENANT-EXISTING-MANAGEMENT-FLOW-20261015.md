# UAT & Remediation Evidence: `TENANT-EXISTING-MANAGEMENT-FLOW-20261015`

- **Task ID**: `TENANT-EXISTING-MANAGEMENT-FLOW-20261015`
- **Finding ID**: `C102-TENANT-DETAIL-EXISTING-MANAGEMENT-CALLERS-MISSING`
- **Capability**: `C102` (Existing-Tenant Settings, Quotas, Enabled Modules, Onboarding Package, Rollout Stage, Suspend, Activate, Invite Role, Acknowledge Role, and Rollback Hold with Authoritative Server ACK & Readback)
- **Owner**: `Gemini`
- **Reviewer**: `Gemini2`
- **Branch**: `gemini/tenant-existing-management-flow-20261015`
- **Base Commit (`origin/dev`)**: `abffadbbcd4b65f17c1a54976a97917fd313f36d` (includes `TENANT-LIFECYCLE-PERSISTENCE-ACK-20261015` commit `6f00bafbe`)
- **Task Spec Ref**: `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1026-platform-frontier-root/TENANT-EXISTING-MANAGEMENT-FLOW-20261015.task-spec.json`
- **Original UI Authority**: `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` (§5.3, lines 286–324)

---

## 1. Executive Summary & Root Cause Analysis

### Defect (`C102-TENANT-DETAIL-EXISTING-MANAGEMENT-CALLERS-MISSING`)

In `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx` (at base blob `c8c524d6bdf2a54839cdf11e7ec0e1282d0dcf79`):

1. **Missing existing-tenant settings, quotas, and enabledModules callers**: While initial tenant creation in `apps/platform-admin-web/app/tenants/page.tsx` accepted initial quotas and modules, `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx` rendered quotas (`monthlyBookings`) and `MODULES` only as static read-only `<DL>` rows and never invoked `client.updatePlatformTenantSettings(tenantId, command)` (`POST /api/platform-admin/tenants/:tenantId/settings`).
2. **Missing onboarding package, rollout stage, suspend, and activate callers**: `TenantDetailPage` only bound `getPlatformTenant`, `inviteTenantRole`, `acknowledgeTenantRole`, and `rollbackHoldTenant`. It provided no interactive form or action handler for `updatePlatformTenantOnboarding` (`POST /api/platform-admin/tenants/:tenantId/onboarding`), `setPlatformTenantRolloutStage` (`POST /api/platform-admin/tenants/:tenantId/rollout`), `suspend` (`POST /api/platform-admin/tenants/:tenantId/suspend`), or `activate` (`POST /api/platform-admin/tenants/:tenantId/activate`).
3. **Synthetic local receipt instead of canonical server ACK + authoritative readback**: Existing role invite/acknowledge and rollback-hold handlers in `TenantDetailPage` set a synthetic local `ActionReceipt` (`Audit receipt · new Date().toISOString()`) without validating the canonical `PlatformAdminTenantRecord` response or refetching authoritative tenant state via `getPlatformTenant(tenantId)`.
4. **Missing explicit UI authority & risk-confirmation wiring**: `TenantDetailPage` did not check `usePlatformAdminAuthority()` (`platform` realm, `pa_tenant_mgr` / `pa_super_admin` role, `foundation:write` scope) or enforce medium-risk confirmation checkboxes and high-risk suspension audit reasons per `docs/05-ui/platform-admin-design-handoff-packet-20260525.md` §5.3.

---

## 2. Before-Fix Reproduction vs. After-Fix Verification

### Before-Fix Reproduction (against unmodified `HEAD:apps/platform-admin-web/app/tenants/[tenantId]/page.tsx` without resetting the active worktree)

Command:

```bash
git show abffadbbc:apps/platform-admin-web/app/tenants/[tenantId]/page.tsx > /tmp/legacy-tenant-detail-page.tsx
TENANT_DETAIL_PAGE_OVERRIDE_PATH=/tmp/legacy-tenant-detail-page.tsx pnpm exec vitest run tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx
```

Actual result on unmodified `page.tsx` (**Exit Code 1**, `1 failed` test file, `6 failed` tests):

- `renders existing tenant settings/quotas/enabledModules in TenantDetailPage, awaits deferred server ACK, refetches authoritative tenant data, and preserves create flow`:
  `TestingLibraryElementError: Unable to find an element by: [data-testid="tenant-settings-form"]` — header only rendered `Open in Tenant Console` and `Enter rollback_hold`; quotas/modules were static read-only text.
- `retains user form edits and displays error banner when settings mutation rejects`:
  `TestingLibraryElementError: Unable to find an element by: [data-testid="tenant-settings-form"]`.
- `wires onboarding package, role invite/acknowledge, rollout stage promotion, suspend, activate, and rollback_hold in TenantDetailPage with canonical ACK and readback`:
  `TestingLibraryElementError: Unable to find an element by: [data-testid="tenant-onboarding-form"]`.
- `retains onboarding and rollout stage drafts and displays canonical error when server rejects stage promotion or onboarding update`:
  `TestingLibraryElementError: Unable to find an element by: [data-testid="tenant-rollout-stage-form"]`.
- `enforces pa_tenant_mgr/pa_super_admin role, platform realm, and foundation:write scope in both UI and server guard, ignoring browser cookies`:
  `TestingLibraryElementError: Unable to find an element by: [data-testid="tenant-authority-readonly-banner"]`.
- `enforces medium confirmation checkboxes, high-risk suspend/rollback reasons, quota/module validation, role ack/rollback guards, and cross-tenant refusals`:
  `TestingLibraryElementError: Unable to find an element by: [data-testid="tenant-settings-form"]`.

### After-Fix Verification

Command:

```bash
pnpm exec vitest run tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx
```

Actual result after remediation (**Exit Code 0**, `1 passed` test file, `6 passed` tests).

---

## 3. §0.7 Per-Item Fix & Verification Matrix

| Finding／驗收項 | 原始碼依據與修改位置 | 舊版重現 → 修正版結果 | 命令、退出碼、執行版本與證據位置 | 未驗項與具體限制 |
| :--- | :--- | :--- | :--- | :--- |
| `C102-TENANT-DETAIL-EXISTING-MANAGEMENT-CALLERS-MISSING` / `tenant-existing-management_settings-quota-modules-real-command` | `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx` (`TenantDetailPage`、`handleSaveSettings`:560-603、`tenant-settings-form`:1356-1441)；`apps/platform-admin-web/app/tenants/tenant-lifecycle-client.ts` (`buildUpdateTenantSettingsCommand`:213-237、`assertValidTenantSettingsCommand`:239-272、`updateTenantSettingsWithReadback`:462-494)；重用唯讀 `apps/platform-admin-web/components/tenant-governance-shared.tsx` (`TenantIdentityFields`、`QuotaFields`、`ModuleFields`、`toTenantSettingsFormState`、`toggleTenantModule`) | 舊版 (`abffadbbc`)：`TenantDetailPage` 僅靜態顯示配額與模組數量，無 `tenant-settings-form` 與 `updatePlatformTenantSettings` 呼叫（**Exit 1**） → 修正版：提供真實可編輯表單（租戶名稱、`activeDrivers`、`monthlyBookings`、`monthlyApiCalls`、`enabledModules`），送出 `POST /api/platform-admin/tenants/:tenantId/settings`，等待 deferred 伺服器持久化完成後再執行 `GET /api/platform-admin/tenants/:tenantId` 權威讀回並顯示 `tenant-canonical-ack-banner`；伺服器拒絕時顯示 `tenant-lifecycle-error-banner` 並保留使用者未儲存草稿；保留原有 `createPlatformTenant` 流程（**Exit 0**） | `pnpm exec vitest run tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx` → **Exit 0**（6 pass / 0 fail / 0 skip）；證據：`tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx` | Hosted CI / 合法角色雲端登入與跨站營運驗收維持原外部任務追蹤；本 VM 依 `AGENTS.md` 不啟動伺服器或瀏覽器 E2E |
| `tenant-existing-management_onboarding-stage-status-ack-readback` | `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx` (`handleSaveOnboarding`:605-648、`executeRolloutStageTransition`:650-696、`handleActivateTenant`:706-743、`handleConfirmSuspend`:745-780、`handleConfirmRollbackHold`:782-817、`handleInviteRole`:819-850、`handleAcknowledgeRole`:852-885)；`apps/platform-admin-web/app/tenants/tenant-lifecycle-client.ts` (`updateTenantOnboardingWithReadback`:496-514、`setTenantRolloutStageWithReadback`:516-534、`suspendTenantWithReadback`:536-566、`activateTenantWithReadback`:568-596、`rollbackHoldTenantWithReadback`:598-617、`inviteTenantRoleWithReadback`:619-635、`acknowledgeTenantRoleWithReadback`:637-653)；`apps/platform-admin-web/app/tenants/translations.ts`:1-266 | 舊版 (`abffadbbc`)：頁面缺少 Onboarding 套件與 gate 編輯、Rollout stage 推進、Suspend、Activate 操作，且僅以本地時間戳偽造 `Audit receipt`（**Exit 1**） → 修正版：完整接通 `POST /onboarding`、`POST /rollout`、`POST /suspend`、`POST /activate` 並保留 `POST /roles/invite`、`POST /roles/acknowledge`、`POST /rollback-hold`；所有 7 組管理動作均等待伺服器回應並以 `fetchAuthoritativeTenant` 讀回權威 `PlatformAdminTenantRecord`（含 `status`、`rollout.stage`、`updatedAt` 與高風險原因）；完整驗證 pending 狀態與伺服器 409 gate 阻擋錯誤保留草稿行為（**Exit 0**） | `pnpm exec vitest run tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx` → **Exit 0**（6 pass / 0 fail / 0 skip） | Hosted CI 於 handoff 後針對同一 candidate SHA 執行 |
| `tenant-existing-management_original-authority-confirm-denials` | `apps/platform-admin-web/app/tenants/tenant-lifecycle-client.ts` (`hasTenantLifecycleWriteAuthority`:97-128、`assertTenantLifecycleWriteAuthority`:130-138、`assertHighRiskReason`:140-151、`assertCanonicalTenantRecord`:153-194、`buildTenantLifecycleAvailableActions`:344-456)；`apps/platform-admin-web/app/tenants/[tenantId]/page.tsx` (`usePlatformAdminAuthority`:420、`tenant-authority-readonly-banner`:1296-1306、中風險確認勾選與高風險 `suspend` / `rollback_hold` 必填原因對話框:2076-2304)；重用唯讀 `apps/api/src/common/auth/auth.policy.ts`:438-448 | 舊版 (`abffadbbc`)：頁面未檢查 `pa_tenant_mgr` / `pa_super_admin` 角色、`platform` realm 與 `foundation:write` scope，亦無中風險確認或高風險暫停原因控管（**Exit 1**） → 修正版：同時驗證 UI 權限與後端 `resolveRouteAuthPolicy`（`platform` realm + `foundation:write` scope），證明瀏覽器 `document.cookie` 無法偽造權限；保留中風險確認勾選、高風險 `suspend` / `rollback_hold` 非空稽核原因、未邀請角色不可 acknowledge、`rollback_hold` 阻擋 stage 推進、負數配額與非法模組 400 拒絕，以及跨租戶回應 `CROSS_TENANT_REFUSED` 攔截（**Exit 0**） | `pnpm exec vitest run tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx` → **Exit 0**（6 pass / 0 fail / 0 skip） | 未修改 `auth.policy.ts`、`packages/contracts/src/index.ts`、`packages/api-client/` 或任何後端檔案 |
| `tenant-existing-management_exact-candidate-validation` | `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`、`apps/platform-admin-web/app/tenants/tenant-lifecycle-client.ts`、`apps/platform-admin-web/app/tenants/translations.ts`、`tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx`、`docs/04-uat/system-remediation-20260906/TENANT-EXISTING-MANAGEMENT-FLOW-20261015.md` | 舊版 (`abffadbbc`)：缺少既有租戶管理 UI 呼叫端與對應單元測試（**Exit 1**） → 修正版：在核准 `write_scopes` 內完成全部 7 組動作與既有 create/invite/ack/rollback 回歸測試，`@drts/platform-admin-web` `typecheck` 與 `lint`、`lint:root`、以及相關 C102 單元測試全數通過（**Exit 0**） | 見下方第 4 節完整命令（`@drts/platform-admin-web typecheck` Exit 0、`@drts/platform-admin-web lint` Exit 0、`lint:root` Exit 0、4 組單元測試套件共 31 tests 全數 Exit 0） | 本任務僅驗證 Source / unit / typecheck / lint 與同候選審查／CI；真實合法角色登入與 hosted 旅程由原對應任務獨立驗收，不推論整體 C102 或 Final 完成 |

---

## 4. Executed Verification Commands & Exit Codes

1. **Focused UI & Full-Stack Controller/Service/Repository Wiring Unit Tests**:

   ```bash
   pnpm exec vitest run tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx
   ```

   - Result: **Exit 0** (`1 passed` test file, `6 passed` tests).

2. **C102 Tenant Lifecycle & Persistence ACK Non-Regression Suite**:

   ```bash
   pnpm exec vitest run \
     tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx \
     tests/unit/tenant-lifecycle-persistence-ack-20261015/tenant-lifecycle-persistence-ack.test.ts \
     tests/unit/system-remediation/sr-qa-governance-001/c102-tenant-lifecycle-governance.test.ts \
     tests/unit/system-remediation/sr-qa-tenant-001/tenant-directory-and-settings.test.ts \
     apps/api/tests/unit/tenants.service.test.ts
   ```

   - Result: **Exit 0** (all test files and cases passed).

3. **Platform Admin Web Typecheck (`next-typecheck.sh` / `tsc --noEmit`)**:

   ```bash
   pnpm --filter @drts/platform-admin-web typecheck
   ```

   - Result: **Exit 0** (`Generating route types... ✓ Types generated successfully`, 0 TypeScript errors).

4. **Platform Admin Web & Root ESLint (`--max-warnings=0`)**:

   ```bash
   pnpm --filter @drts/platform-admin-web lint && pnpm lint:root
   ```

   - Result: **Exit 0** (0 errors, 0 warnings).

5. **Commit Trailers Gate (`check_commit_trailers.py`)**:

   ```bash
   python3 tools/ci/git/check_commit_trailers.py --base origin/dev --head HEAD
   ```

   - Result: **Exit 0** (verified on candidate commit before handoff).

---

## 5. Scope Compliance & Honest Execution Boundaries

- **Strict `write_scopes` Compliance**: Changes are strictly confined to the 5 authorized paths in `write_scopes`:
  1. `apps/platform-admin-web/app/tenants/[tenantId]/page.tsx`
  2. `apps/platform-admin-web/app/tenants/tenant-lifecycle-client.ts`
  3. `apps/platform-admin-web/app/tenants/translations.ts`
  4. `tests/unit/tenant-lifecycle-management-ui-20261015/tenant-lifecycle-management-ui.test.tsx`
  5. `docs/04-uat/system-remediation-20260906/TENANT-EXISTING-MANAGEMENT-FLOW-20261015.md`
- **Excluded Scopes Untouched**: `packages/api-client/`, `packages/contracts/src/index.ts`, `apps/platform-admin-web/components/tenant-governance-shared.tsx`, `apps/platform-admin-web/app/tenant-governance/page.tsx`, `apps/api/src/modules/platform-admin/*`, and `apps/api/src/common/auth/*` were reused read-only without modification.
- **VM & Runtime Boundary**: Per `AGENTS.md`, no product development servers, preview servers, Playwright browser runners, or Docker Compose infrastructure were started on this VM. Real legitimate-role login and hosted environment journeys remain governed by their original runtime acceptance tasks (`SR-LIVE-ENTRY-001`, `ENTRY-TENANT-GOOGLE-OIDC-20261005`) and are not inferred from this Source task.
