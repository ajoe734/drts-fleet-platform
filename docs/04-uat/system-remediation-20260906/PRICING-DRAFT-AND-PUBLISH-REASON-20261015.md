# UAT Evidence: PRICING-DRAFT-AND-PUBLISH-REASON-20261015

Status: implementation complete; handed off to `Gemini2` for independent review and same-SHA mandatory hosted CI / protected merge.

## 1. Metadata & Scope

- **Task ID**: `PRICING-DRAFT-AND-PUBLISH-REASON-20261015` (`完成費率草稿建立與發布原因權威稽核`)
- **Owner / Reviewer**: `Gemini` / `Gemini2`
- **Branch**: `gemini/pricing-draft-and-publish-reason-20261015`
- **Immutable Base SHA (`origin/dev`)**: `ed70d73a03dd224e109867c99b7d04128484a3fe`
- **Pre-Fix Defect Reproduction Anchor SHA**: `a52a97befaa6fe6f72fc15c9e07e51d23fffe2b1` (`a52a97bef`)
- **Initial Implementation Checkpoint SHA**: `3a620a47331977793f85579e631dca45e523a9d2` (PR `#2656`)
- **R1 Scope-Coordination Checkpoint SHA**: `57aeedc32f9a53d9c8e000f6864b0d115740c11c`
- **R2 Code-Complete SHA (including `E2E-011` caller adaptation)**: `2603ca7ab8ae6f618415ffd651a6c38991141417`
- **Final Review Candidate SHA**: the enclosing UAT evidence commit on `gemini/pricing-draft-and-publish-reason-20261015` (parent `2603ca7ab8ae6f618415ffd651a6c38991141417`; exact 40-char SHA recorded in `.local/pricing-draft-and-publish-reason-20261015/candidate.json` and `ai-status.sh handoff`).
- **Canonical Spec References**:
  - R1: `.local/remaining-original-functional-fixes-20261015/PRICING-DRAFT-AND-PUBLISH-REASON-20261015.json` (SHA-256 `25d89d4bf363b5f6ba1518dd1108acc2a4549ef85a75a3ae067ddd6dd08e1d22`)
  - R2 (Supervisor routine caller scope coordination granted `2026-10-15T13:22:43Z`): `.local/goal-continuation-20261015T1319-remaining-original-configuration-root/PRICING-DRAFT-AND-PUBLISH-REASON-20261015-R2-one-existing-E2E-caller.task-spec.json` (SHA-256 `18591e8e37048c174a21a641b21203211b4238ea2e66fdc7f47e75a83b3bd716`)
- **Source Audit Reference**: `.local/goal-continuation-20261015T0940-internal-frontier-root/C076-current-accepted-pricing-dataflow-readonly-audit.json` (SHA-256 `b8bba80c9b9b63a6368a6abeb05feeb34f75f01b9d747c3970dee2e3609200f5`)
- **Assigned Source Acceptance Keys (4 own keys only)**:
  1. `pricing_actual-create-draft-command-and-readback`
  2. `pricing_publish-reason-reaches-authoritative-audit`
  3. `pricing_original-version-scope-and-failure-regressions`
  4. `pricing_exact-candidate-validation`
- **Authorized Write Scopes Touched (7 of 8)**:
  - `packages/contracts/src/index.ts`
  - `apps/api/src/modules/platform-admin/platform-admin.service.ts`
  - `apps/platform-admin-web/app/pricing/page.tsx`
  - `tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx`
  - `tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts`
  - `tests/e2e/E2E-011-platform-admin-control-plane.sh`
  - `docs/04-uat/system-remediation-20260906/PRICING-DRAFT-AND-PUBLISH-REASON-20261015.md`
  - _(Note: `tests/unit/system-remediation/sr-qa-finance-001/c076-fee-plan-pricing.test.ts` passed unmodified at 4/4 tests; `packages/api-client` and `apps/api/src/modules/platform-admin/platform-admin.controller.ts` were not modified because existing pass-through already forwards `CreatePlatformPricingRuleCommand` and `PublishPlatformPricingRuleCommand` unchanged.)_

---

## 2. R2 Caller Scope Coordination Resolution

1. On checkpoint `57aeedc32f9a53d9c8e000f6864b0d115740c11c`, hosted CI runs `38726011826` / `38726011901` passed 27/30 checks (including `unit` `116394169062`, `integration`, `typecheck`, `lint`, `ui-route-e2e`, `Product smoke acceptance` `116396367362`, and `Commit trailers`), failing solely in `cross-surface-e2e` (`116394169138`, 21/22 scenarios passed) at `tests/e2e/E2E-011-platform-admin-control-plane.sh` lines 518–524 (`UAT-ADM-007 — POST /platform-admin/pricing-rules/:ruleId/publish`), which sent `{ publishedBy: $publishedBy }` without `reason` and received HTTP `400 FIELD_REQUIRED` from the newly enforced server validation.
2. At `2026-10-15T13:22:43Z`, Supervisor granted R2 scope coordination adding `tests/e2e/E2E-011-platform-admin-control-plane.sh` to `write_scopes` (`.local/goal-continuation-20261015T1319-remaining-original-configuration-root/PRICING-DRAFT-AND-PUBLISH-REASON-20261015-R2-one-existing-E2E-caller.task-spec.json`, SHA-256 `18591e8e37048c174a21a641b21203211b4238ea2e66fdc7f47e75a83b3bd716`).
3. In commit `2603ca7ab8ae6f618415ffd651a6c38991141417`, `tests/e2e/E2E-011-platform-admin-control-plane.sh` line 521 was updated from `'{ publishedBy: $publishedBy }'` to `'{ publishedBy: $publishedBy, reason: "e2e-011-pricing-rule-publish" }'`, preserving `publishedBy`, all existing status/version/evidence/audit/readback/negative assertions, and the server-side `>= 12` trimmed-character requirement.

---

## 3. §0.7 Finding & Acceptance Mapping Table

| Finding／驗收項                                                  | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                                                                                                               | 舊版重現 → 修正版結果                                                                                                                                                                                                                                                                                                         | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                           | 未驗項與具體限制                                                                                                                                                         |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `C076-F1` / `pricing_actual-create-draft-command-and-readback`   | `apps/platform-admin-web/app/pricing/page.tsx:507-718` (`CreateDraftModal`), `apps/platform-admin-web/app/pricing/page.tsx:1239-1301` (`handleCreateDraft` calling `client.createPlatformPricingRule(command)` + `Promise.all` canonical readback + `setSelectedDraftId(created.ruleId)`), `apps/platform-admin-web/app/pricing/page.tsx:1383-1404` (header button opens modal on `passenger` tab) | 舊版 `a52a97bef`：點擊 `建立乘客定價草稿` 僅切換分頁、0 次呼叫 `POST /api/platform-admin/pricing-rules`（見 `.local/pricing-draft-and-publish-reason-20261015/before.log`）。修正版 `2603ca7ab`：送出有效草稿後呼叫 `createPlatformPricingRule`、完成雙列表 canonical readback 並載入版本比對與發布流程。                     | `pnpm exec vitest run tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx ...` → Exit `0` (`25 passed`)；證據：`.local/pricing-draft-and-publish-reason-20261015/after.log`                     | 同 SHA 遠端 mandatory CI、`Gemini2` 獨立審查與 protected merge 待完成；未宣稱 Demo-owned quote/order 計價路徑或 Cloud Run 瀏覽器 E2E 已於本機完成。                      |
| `C076-F2` / `pricing_publish-reason-reaches-authoritative-audit` | `packages/contracts/src/index.ts:7655,7673` (`publishReason?: string \| null`, `PublishPlatformPricingRuleCommand.reason: string`), `apps/api/src/modules/platform-admin/platform-admin.service.ts:2117-2204` (`publishPlatformPricingRule` server validation `>= 12` trimmed chars, actor normalization, `rule.publishReason`, `recordAudit` `newValuesSummary.reason`), `page.tsx:1303-1361`     | 舊版 `a52a97bef`：UI 雖檢查 `>= 12` 字元但丟棄 `reason` 且送出裝飾性 `platform_admin:zh`，後端亦未驗證或寫入 `recordAudit`（見 `before.log`）。修正版 `2603ca7ab`：前後端強制驗證 trimmed `reason >= 12`、帶入 `actorId` 並寫入 `publish_platform_pricing_rule` 權威 audit 與回讀紀錄。                                       | `pnpm exec vitest run tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx ...` → Exit `0` (`25 passed`)；證據：`.local/pricing-draft-and-publish-reason-20261015/after.log`                     | 同 SHA 遠端 mandatory CI（含更新後之 `E2E-011` `cross-surface-e2e`）、`Gemini2` 審查與 merge 待完成。                                                                    |
| `pricing_original-version-scope-and-failure-regressions`         | `apps/api/src/modules/platform-admin/platform-admin.service.ts:2026-2204`, `apps/platform-admin-web/app/pricing/page.tsx:1239-1361`, `tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts:70-126`, `tests/e2e/E2E-011-platform-admin-control-plane.sh:518-524`                                                                                                 | 舊版 `57aeedc32`：`E2E-011` `UAT-ADM-007` 漏傳 `reason` 致 `cross-surface-e2e` 400 `FIELD_REQUIRED`。修正版 `2603ca7ab`：保留重複版本拒絕（`409 PRICING_RULE_VERSION_CONFLICT`）、發布失敗不偽造本地成功收據（`503 PRICING_PUBLISH_UNAVAILABLE`）、原 C076 4 案例、C103 5 案例、platform-admin 12 案例及 `E2E-011` 語法通過。 | `pnpm exec vitest run ...` (4 files, 25 tests) → Exit `0`；`bash -n tests/e2e/E2E-011-platform-admin-control-plane.sh` → Exit `0`；證據：`.local/pricing-draft-and-publish-reason-20261015/after.log`, `typecheck-lint.log`                | 完整 C076 多實例資料庫交易鎖定與跨角色真實瀏覽器驗收維持原後續任務邊界，不在本 task 宣稱完成。                                                                           |
| `pricing_exact-candidate-validation`                             | 全部 7 個已修改之授權 scope 檔案（見 §1）                                                                                                                                                                                                                                                                                                                                                          | 舊版 `a52a97bef`：單元回歸失敗（4 failed）；修正版 `2603ca7ab`：4 個單元測試檔（25 tests）、`@drts/contracts` build、`@drts/api` typecheck、`@drts/platform-admin-web` typecheck、`typecheck:root`、ESLint（`--max-warnings=0`）與 `bash -n` 全部 Exit `0`。                                                                  | 見 §4.2 完整命令與退出碼 `0`；證據：`.local/pricing-draft-and-publish-reason-20261015/after.log`、`.local/pricing-draft-and-publish-reason-20261015/typecheck-lint.log`、`.local/pricing-draft-and-publish-reason-20261015/candidate.json` | 依 `AGENTS.md` 本 VM 不啟動任何產品 dev/preview/browser/Docker 服務；最終候選之 hosted CI、`Gemini2` review、protected merge 與 `record-acceptance` 由候選生命週期收錄。 |

---

## 4. Before / After Reproduction & Verification Evidence

### 4.1 Before-Fix Reproduction (at base `ed70d73a03dd224e109867c99b7d04128484a3fe` / test anchor `a52a97bef`)

- **Command**:
  ```bash
  pnpm exec vitest run tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx
  ```
- **Log File**: `.local/pricing-draft-and-publish-reason-20261015/before.log`
- **Result**: Exit `1` (`1 failed (1) | 4 failed (4)`)
  1. **`C076-F1` failure**: Clicking `建立乘客定價草稿` (`pricing.action.createPassengerDraft`) rendered no draft creation form (`Unable to find a label with the text of: 規則名稱`) and issued `0` `POST /api/platform-admin/pricing-rules` requests.
  2. **`C076-F2` UI-to-audit failure**: When publishing a pre-seeded draft after entering `"   Board-approved Q2 passenger fee schedule rollout   "`, the outgoing `POST /api/platform-admin/pricing-rules/:ruleId/publish` body dropped `reason` and sent the cosmetic locale string `"platform_admin:zh"`:
     ```diff
     - Expected
     + Received
       {
     -   "publishedBy": "pa-pricing-manager-01",
     -   "reason": "Board-approved Q2 passenger fee schedule rollout",
     +   "publishedBy": "platform_admin:zh",
       }
     ```
  3. **`C076-F2` server enforcement failure**: Calling `platformAdminController.publishPlatformPricingRule` with `undefined`, `""`, `"   "`, or `"  short 11c  "` succeeded without throwing `ApiRequestError`.

### 4.2 After-Fix Verification (at R2 Code-Complete `2603ca7ab8ae6f618415ffd651a6c38991141417`)

- **Impacted Unit Test Command**:
  ```bash
  pnpm exec vitest run \
    tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx \
    tests/unit/system-remediation/sr-qa-finance-001/c076-fee-plan-pricing.test.ts \
    tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts \
    tests/unit/platform-admin.test.ts
  ```
- **Log File**: `.local/pricing-draft-and-publish-reason-20261015/after.log`
- **Exit Code**: `0` (`Test Files 4 passed (4), Tests 25 passed (25)`)

- **Shell Syntax, Build, Typecheck & Lint Command**:
  ```bash
  bash -n tests/e2e/E2E-011-platform-admin-control-plane.sh && \
  pnpm --filter @drts/contracts build && \
  pnpm --filter @drts/control-plane-auth build && \
  pnpm --filter @drts/passenger-client build && \
  pnpm --filter @drts/api typecheck && \
  pnpm --filter @drts/platform-admin-web typecheck && \
  pnpm typecheck:root && \
  pnpm exec eslint \
    apps/platform-admin-web/app/pricing/page.tsx \
    packages/contracts/src/index.ts \
    apps/api/src/modules/platform-admin/platform-admin.service.ts \
    tests/unit/pricing-draft-and-publish-reason-20261015/pricing-draft-and-publish-reason.test.tsx \
    tests/unit/system-remediation/sr-qa-finance-001/c076-fee-plan-pricing.test.ts \
    tests/unit/system-remediation/sr-qa-governance-001/c103-partner-schemes-pricing.test.ts \
    --max-warnings=0
  ```
- **Log File**: `.local/pricing-draft-and-publish-reason-20261015/typecheck-lint.log`
- **Exit Code**: `0`

---

## 5. Honest Remaining Boundaries (Out of Scope for This Task)

- This task claims only its 4 assigned `Source` acceptance keys (`pricing_actual-create-draft-command-and-readback`, `pricing_publish-reason-reaches-authoritative-audit`, `pricing_original-version-scope-and-failure-regressions`, `pricing_exact-candidate-validation`), which will be recorded after same-SHA mandatory hosted CI, independent `Gemini2` review approval, and protected merge to `dev`.
- The unaudited Demo-owned quote/order fare calculation path, full C076 multi-instance concurrency/database transaction locking, and live deployed Cloud Run multi-role browser E2E evidence remain honestly open under their respective tasks and are not claimed as completed by this change.
- In compliance with `AGENTS.md`, no product dev servers, preview servers, Playwright browser servers, or Docker Compose services were started on this VM.
