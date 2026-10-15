# SERVICE-PRODUCT-PERSISTENCE-ACK-20261015 — 服務產品建立更新與時間策略等待權威持久化確認：驗收證據報告

| 欄位                                     | 內容                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task ID                                  | `SERVICE-PRODUCT-PERSISTENCE-ACK-20261015`                                                                                                                                                                                                           |
| Task Spec Ref                            | `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1026-platform-frontier-root/SERVICE-PRODUCT-PERSISTENCE-ACK-20261015.task-spec.json` (`sha256: 72bf06fba1e87e7b676f442fb36acf5303ac24bb95c76a6e96c9bea6d39dfc76`)       |
| Confirmed Finding ID                     | `C107-F1` (`C106-C107-current-accepted-service-area-product-dataflow-readonly-audit.json`, `sha256: 7bf36ee1c4c68fc4c208680f853b4aca36e4f7503b6d2b323764db8aaa9eeb9b`)                                                                               |
| Owner / Reviewer                         | `Gemini` / `Gemini2`                                                                                                                                                                                                                                 |
| Immutable Audited Base SHA               | `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`                                                                                                                                                                                                           |
| Task Registration `source_commit`        | `afbcbba5de66f7ce0099ae9e3d92790d45f69028`                                                                                                                                                                                                           |
| Current Accepted Base SHA (`origin/dev`) | `8e56ea2db5435d57834899fca8018634b0a9fac0`                                                                                                                                                                                                           |
| Candidate Branch / Worktree              | `gemini/service-product-persistence-ack-20261015` / `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-service-product-persistence-ack-20261015`                                                                            |
| Prior Reopened Candidate SHA             | `e5718a90e0200b75e6bf9ff05f32eaaca036fee2`（`Gemini2` 退修：無條件 `async` 破壞無 DB 同步呼叫與同步驗證拋錯）                                                                                                                                        |
| Candidate SHA                            | 於 `handoff` 前鎖定並與遠端 `origin/gemini/service-product-persistence-ack-20261015` 一致                                                                                                                                                            |
| Required Acceptance Keys                 | `service-product_canonical-write-ack-before-registry-and-success`, `service-product_actual-mutations-readback-and-concurrent-retry`, `service-product_original-type-scope-and-memory-mode-regressions`, `service-product_exact-candidate-validation` |

---

## 1. 缺陷定位與修改依據 (`C107-F1` 與前輪退修修復)

### 1.1 權威依據與原始資料流缺陷 (`C107-F1`)

依據唯讀資料流審計報告 `/home/lupin/workspace/drts-fleet-platform/.local/goal-continuation-20261015T1026-platform-frontier-root/C106-C107-current-accepted-service-area-product-dataflow-readonly-audit.json` (`C107-F1`) 與 `SERVICE-PRODUCT-PERSISTENCE-ACK-20261015.task-spec.json`：

- **觸發條件 (`C107-F1`)**：當 `ServiceProductRepository` 啟用 (`databaseService.isEnabled() === true`) 時，針對 `createServiceProduct`、`updateServiceProduct` 或 `upsertRuntimeProfilePolicy` 發起合法寫入，而底層 PostgreSQL 查詢 Promise (`ops.phase1_service_products` / `ops.runtime_profile_service_product_policies`) 尚處於 `pending` 或發生 `reject`。
- **舊版 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`) 實際路徑**：
  1. `ServiceProductService` (`apps/api/src/modules/service-product/service-product.service.ts`) 先同步修改記憶體快取 `this.records` / `this.runtimePolicies`。
  2. `private persist(...)` 以 `void this.repository.persistChanges(payload).catch(...)` 丟棄持久化 Promise，發生拒絕時僅呼叫 `this.repository.reportPersistenceFailure(error, context)` 記錄 warn log，不向外拋出錯誤。
  3. `createServiceProduct` 與 `updateServiceProduct` 在持久化尚未完成前即同步寫入 `create_service_product` / `update_service_product` 成功審計日誌並回傳結果。
  4. `ServiceProductController` (`apps/api/src/modules/service-product/service-product.controller.ts`) 的三個寫入端點 (`upsertRuntimePolicy` line 49、`createServiceProduct` line 63、`updateServiceProduct` line 84) 皆為同步呼叫，立即回傳 `toApiSuccessEnvelope` / `toActionReceiptEnvelope`。
  5. 前端 `apps/platform-admin-web/app/service-products/page.tsx` (`handleCreate` / `handleUpdate`) 雖然 `await client.post` / `await client.put`，但因後端同步回傳成功並污染同行程 `this.records`，導致資料庫尚未確認或拒絕寫入時仍顯示成功並阻礙後續重試（重試同 ID/型別時因快取殘留而誤拋 `409 CONFLICT`）。

### 1.2 前輪候選 `e5718a90e0200b75e6bf9ff05f32eaaca036fee2` 退修定位 (`Gemini2`)

- **退修觸發條件**：於 `e5718a90e0200b75e6bf9ff05f32eaaca036fee2` 將 `ServiceProductService.createServiceProduct`、`updateServiceProduct` 與 `upsertRuntimeProfilePolicy` 外層直接標記為無條件 `async`，導致：
  1. 在無資料庫／停用 repository 模式 (`!this.repository?.isEnabled()`) 下，`await this.persist(...)` 仍會延遲一個 microtask 才更新 `this.records` / `this.runtimePolicies` 並回傳 `Promise` 而非同步實體物件，使同步呼叫端無法立即讀到更新後狀態。
  2. 同步參數與唯一性驗證在 `async` 函式內改為回傳 rejected `Promise` 而非同步 `throw`，導致以 `expect(() => service.createServiceProduct(...)).toThrow(...)` 斷言同步拋錯之既有測試失敗並產生 Unhandled Rejection。
  3. 共計造成 `write_scopes` 外 5 個既有記憶體模式測試套件出現 23 個測試失敗與 4 個 Unhandled Rejections（違反 Acceptance 3 `service-product_original-type-scope-and-memory-mode-regressions`）。

### 1.3 實作修復內容（嚴格限於授權 `write_scopes`）

1. `apps/api/src/modules/service-product/service-product.service.ts`：
   - `private async persist(...)`：改為 `async` 並 `await this.repository.persistChanges(payload)`；若拋出錯誤，呼叫 `this.repository.reportPersistenceFailure(error, context)` 後原樣 `throw error` 向上傳遞。
   - 保持 `upsertRuntimeProfilePolicy`、`createServiceProduct`、`updateServiceProduct` 外層為非 `async` 函式：
     - 所有輸入正規化、產品型別/時間/結算模式/駕照資格驗證、時間窗 (`effectiveFrom` / `effectiveUntil`) 檢查及唯一性/存在性檢查 (`assertUniqueServiceProduct` / `require`) 皆於函式開頭**同步執行並同步拋出 `ApiRequestError`**。
     - 當 `!this.repository?.isEnabled()`（無資料庫或 repository 未啟用之記憶體模式）時，**同步更新 `this.records` / `this.runtimePolicies`、同步寫入審計日誌並同步回傳結果**，100% 保留既有記憶體模式同步語義。
     - 當 `this.repository?.isEnabled() === true`（啟用持久化模式）時，回傳 `this.persist(...).then(...)` 之 Promise：在 `persistChanges` resolve 之前絕不修改 `this.records` / `this.runtimePolicies` 或產生成功審計；在等待期間透過 `inFlightGeneratedIds` 避免並發自動編號碰撞，失敗時於 `finally` 釋放且不污染 `this.records` 或 `sequence`；待持久化確認後再次校驗唯一性，再寫入 `this.records`、更新 `this.sequence`、記錄審計日誌並 resolve。
2. `apps/api/src/modules/service-product/service-product.controller.ts`：
   - `upsertRuntimePolicy`、`createServiceProduct`、`updateServiceProduct` 三個端點全數改為 `async` 並 `await` 對應 `ServiceProductService` 方法後，才包裝 `toApiSuccessEnvelope` 或 `toActionReceiptEnvelope`。
3. 既有直接測試更新（支援 `await` 與 `Promise.resolve().then(...)` 包裝同步拋錯斷言）：
   - `tests/unit/service-product.test.ts`
   - `tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts`
4. 新增專屬無 Socket 延遲/拒絕持久化與無 DB 同步模式回歸測試套件：
   - `tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts`

---

## 2. 交付品質與驗收對照表（依 `AI_COLLABORATION_GUIDE.md` §0.7）

| Finding／驗收項                                                                      | 原始碼依據與修改位置                                                                                                                                                                                                                                                                                                                                                                     | 舊版重現 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90` / `e5718a90e0200b75e6bf9ff05f32eaaca036fee2`) → 修正版結果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | 命令、退出碼、執行版本與證據位置                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | 未驗項與具體限制                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `C107-F1` / `service-product_canonical-write-ack-before-registry-and-success`        | `apps/api/src/modules/service-product/service-product.service.ts` (`upsertRuntimeProfilePolicy`, `createServiceProduct`, `updateServiceProduct`, `persist`)；`apps/api/src/modules/service-product/service-product.controller.ts` (`upsertRuntimePolicy`, `createServiceProduct`, `updateServiceProduct`)；唯讀搭配 `ServiceProductRepository.persistChanges`                            | **舊版重現 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`, Fail, Exit 1)**：執行 `service-product-persistence-ack.test.ts`，6 案例中 5 案例失敗：`createServiceProduct`、`updateServiceProduct`、`upsertRuntimePolicy` 在 `databaseService.query` Promise 尚處於 `pending` 時已同步完成 (`expect(settled).toBe(false)` 失敗，實際為 `true`)，提前污染 `listServiceProducts()` / `listRuntimeProfilePolicies()` 並發出成功審計與回執；當 `query` reject 時仍回傳 `status: "completed"`。<br>**修正版結果 (Pass, Exit 0)**：6 案例全數通過（6 passed, 0 failed, 0 skipped）。在 `query` pending 期間，controller/service Promise 維持未決、`listServiceProducts()` / `listRuntimeProfilePolicies()` 與審計日誌不提前公開未確認狀態；待 `query` resolve 後才寫入快取、產生審計與回執；當 `query` reject 時原樣拒絕且無殘留狀態或成功審計。 | 重現命令（舊版 Base `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`）：<br>`pnpm exec vitest run tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts` → **Exit 1** (5 failed, 1 passed)<br>驗證命令（修正版）：<br>`pnpm exec vitest run tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts` → **Exit 0** (6 passed, 0 failed, 0 skipped)<br>證據：`tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts`                                                                                                                                                                                                                       | 無 Socket 單元/控制器與真實 `ServiceProductRepository` SQL 參數路徑已完整驗證；本 VM 依規不啟動 PostgreSQL / 產品伺服器 / 瀏覽器。                                                               |
| `service-product_actual-mutations-readback-and-concurrent-retry`                     | `apps/api/src/modules/service-product/service-product.controller.ts` (全部 3 個 mutation callers)、`apps/api/src/modules/service-product/service-product.service.ts` (`assertUniqueServiceProduct`, `resolveServiceProductId`, `inFlightGeneratedIds`)、`tests/unit/service-product.test.ts`、`tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts` | **舊版重現 (`df77ae3586694b9ad753eecf2b3ceab3fbfacb90`, Fail, Exit 1)**：寫入失敗時 `this.records` 已被污染，後續一般重試同 `serviceProductId` / `serviceProductType` 會誤觸重複衝突；並發 pending 寫入在未確認前即全部混入 `listServiceProducts()`。<br>**修正版結果 (Pass, Exit 0)**：涵蓋全部 3 個 controller/service 寫入入口、成功 ACK 後 `listServiceProducts` / `getServiceProduct` / `listRuntimePolicies` / `assertRuntimeProfileServiceProductActive` 正常回讀、寫入失敗後一般重試成功、並發一失敗一成功互不污染、以及並發同 `serviceProductType` 競態時僅允許一筆成功且另一筆以 `409 CONFLICT` (`ApiRequestError`) 拒絕。既有直接測試更新後全數通過。                                                                                                                                                                     | 命令：<br>`pnpm exec vitest run tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts tests/unit/service-product.test.ts tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts`<br>結果：**Exit 0**（3 test files passed, 19 tests passed, 0 failed, 0 skipped）                                                                                                                                                                                                                                                                                                                                                                                                          | 保持既有重試與衝突語義，不引入新 idempotency key 或跨行程鎖契約。                                                                                                                                |
| `Gemini2 Reopen` / `service-product_original-type-scope-and-memory-mode-regressions` | `apps/api/src/modules/service-product/service-product.service.ts` (`upsertRuntimeProfilePolicy`, `createServiceProduct`, `updateServiceProduct`)、`tests/unit/service-product.test.ts`、`tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts`、`tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts`        | **前輪退修重現 (`e5718a90e0200b75e6bf9ff05f32eaaca036fee2`, Fail, Exit 1)**：5 個無 DB 記憶體模式測試套件共 **23 failed + 4 unhandled rejections**（`c016-c024-tenant-booking-cutoff-and-lead-time.test.ts` 2 failed、`tenant-booking-lead-time.test.ts` 1 failed、`apps/api/tests/unit/service-product.service.test.ts` 6 failed + 4 unhandled rejections、`apps/api/tests/unit/owned-mobility.service.test.ts` 12 failed、`apps/api/tests/unit/vehicle-eligibility.service.test.ts` 2 failed）。<br>**修正版結果 (Pass, Exit 0)**：外層方法保持非 `async`，在 `!this.repository?.isEnabled()` 下同步更新記憶體狀態、記錄審計並同步回傳，且同步驗證錯誤直接同步拋出；上述 5 個無 DB 套件共 **159 tests 全數通過（0 failed, 0 unhandled rejections）**，連同 3 個目標套件共 **8 test files / 178 tests 全數通過**。                  | 命令 1：<br>`pnpm exec vitest run tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts tests/unit/service-product.test.ts tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts tests/unit/system-remediation/sr-qa-booking-001/c016-c024-tenant-booking-cutoff-and-lead-time.test.ts tests/unit/system-remediation/sr-qa-booking-001-fix-tenant-lead-time/tenant-booking-lead-time.test.ts` → **Exit 0** (5 files, 46 passed)<br>命令 2：<br>`pnpm --filter @drts/api exec vitest run tests/unit/service-product.service.test.ts tests/unit/owned-mobility.service.test.ts tests/unit/vehicle-eligibility.service.test.ts` → **Exit 0** (3 files, 132 passed, 0 errors) | 本任務僅修復 C107 權威持久化 ACK/錯誤傳遞鏈 (`C107-F1`)；建立後跨模組多端消費一致性（含 Demo 保留之 regulatory/owned/multi-taxi 消費端）與完整 C107 能力閉環不在本窄範圍 Source 任務內宣稱完成。 |
| `service-product_exact-candidate-validation`                                         | 工作樹 `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-service-product-persistence-ack-20261015`、分支 `gemini/service-product-persistence-ack-20261015`、本報告 `docs/04-uat/system-remediation-20260906/SERVICE-PRODUCT-PERSISTENCE-ACK-20261015.md`                                                                                                       | **修正版結果 (Pass, Exit 0)**：於專屬 task worktree 完成修改，記錄不可變審計基線 `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`、當前已接受 `origin/dev` 基線 `8e56ea2db5435d57834899fca8018634b0a9fac0`、前輪退修候選 `e5718a90e0200b75e6bf9ff05f32eaaca036fee2`、修正前後回歸結果與命令退出碼；執行 8 個單元與回歸測試套件（178 tests）、ESLint (`--max-warnings=0`)、Prettier 格式檢查全數 **Exit 0**，`service-product` 模組與測試檔案 **0 TypeScript 錯誤**，並以一般 commit 與 non-force push 送交 `Gemini2` 獨立審查與同一 candidate SHA 之 hosted CI。                                                                                                                                                                                                                                                                           | 命令與退出碼見第 3 節完整驗證清單（本機 8 個測試套件、ESLint、Prettier 皆 **Exit 0**；本機共用 `node_modules/.pnpm` 符號連結差異誠實分列；完整 clean install typecheck/lint/test 由 handoff 後對同一 candidate SHA 之 hosted CI 執行收錄）。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 遵守本 VM 限制：未啟動任何產品 dev/preview 伺服器、Playwright 瀏覽器伺服器或 Docker Compose；未執行雲端部署或觸碰 Root WIP。                                                                     |

---

## 3. 修正前後重現與驗證命令明細

### 3.1 修正前（Unmodified Base `df77ae3586694b9ad753eecf2b3ceab3fbfacb90`）重現紀錄

- **執行命令**：
  ```bash
  pnpm exec vitest run tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts
  ```
- **退出碼**：`1`（`Test Files 1 failed (1)`, `Tests 5 failed | 1 passed (6)`）
- **實測失敗摘要**：
  1. `withholds createServiceProduct registry state, audit log, and controller receipt until repository write ACK`：`expect(settled).toBe(false)` 失敗（實際 `true`），證明 `INSERT INTO ops.phase1_service_products` 尚處於 `pending` 時 controller 已同步回傳完成。
  2. `withholds updateServiceProduct registry mutation, audit log, and controller receipt until repository write ACK`：`expect(updateSettled).toBe(false)` 失敗（實際 `true`）。
  3. `withholds upsertRuntimeProfilePolicy state and controller envelope until repository write ACK`：`expect(policySettled).toBe(false)` 失敗（實際 `true`）。
  4. `propagates repository rejections across create, update, and runtime-policy without poisoning registry or blocking retry`：當 `databaseService.query` 拋出 `pg_create_write_failed` 時，`controller.createServiceProduct` 未 reject，反而 resolve `{ data: { message: "Service product created.", status: "completed", ... } }`。
  5. `handles concurrent pending/rejected mutations and preserves duplicate/conflict rules without state corruption`：`expect(service.listServiceProducts()).toEqual([])` 失敗，兩筆尚未完成持久化的產品皆已提前寫入 `this.records`。

### 3.2 前輪退修候選 (`e5718a90e0200b75e6bf9ff05f32eaaca036fee2`) 無 DB 模式回歸失敗重現紀錄

- **執行命令**：
  ```bash
  pnpm exec vitest run tests/unit/system-remediation/sr-qa-booking-001/c016-c024-tenant-booking-cutoff-and-lead-time.test.ts tests/unit/system-remediation/sr-qa-booking-001-fix-tenant-lead-time/tenant-booking-lead-time.test.ts
  pnpm --filter @drts/api exec vitest run tests/unit/service-product.service.test.ts tests/unit/owned-mobility.service.test.ts tests/unit/vehicle-eligibility.service.test.ts
  ```
- **退出碼**：`1`（共 5 test files failed, 23 tests failed, 4 unhandled rejections）

### 3.3 修正後本機驗證紀錄

1. **目標回歸測試、既有 C107 直接測試與受影響之無 DB 模式回歸測試（共 8 個測試套件 / 178 tests）**：
   - 命令 1：
     ```bash
     pnpm exec vitest run tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts tests/unit/service-product.test.ts tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts tests/unit/system-remediation/sr-qa-booking-001/c016-c024-tenant-booking-cutoff-and-lead-time.test.ts tests/unit/system-remediation/sr-qa-booking-001-fix-tenant-lead-time/tenant-booking-lead-time.test.ts
     ```
     結果：**Exit 0**（5 test files passed, 46 tests passed, 0 failed, 0 skipped）。
   - 命令 2：
     ```bash
     pnpm --filter @drts/api exec vitest run tests/unit/service-product.service.test.ts tests/unit/owned-mobility.service.test.ts tests/unit/vehicle-eligibility.service.test.ts
     ```
     結果：**Exit 0**（3 test files passed, 132 tests passed, 0 failed, 0 unhandled rejections）。
2. **ESLint 檢查 (`--max-warnings=0`)**：
   - 命令：
     ```bash
     pnpm exec eslint --max-warnings=0 apps/api/src/modules/service-product/service-product.service.ts apps/api/src/modules/service-product/service-product.controller.ts tests/unit/service-product.test.ts tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts
     ```
   - 結果：**Exit 0**（0 warnings, 0 errors）。
3. **Prettier 格式檢查**：
   - 命令：
     ```bash
     pnpm exec prettier --check apps/api/src/modules/service-product/service-product.service.ts apps/api/src/modules/service-product/service-product.controller.ts tests/unit/service-product.test.ts tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts docs/04-uat/system-remediation-20260906/SERVICE-PRODUCT-PERSISTENCE-ACK-20261015.md
     ```
   - 結果：**Exit 0**（All matched files use Prettier code style）。
4. **TypeScript 型別檢查**：
   - 命令：`pnpm --filter @drts/api typecheck`
   - 結果：`apps/api/src/modules/service-product/**`、`tests/unit/service-product.test.ts`、`tests/unit/system-remediation/sr-qa-governance-001/c107-service-product-registry.test.ts` 與 `tests/unit/service-product-persistence-ack-20261015/service-product-persistence-ack.test.ts` 皆為 **0 TypeScript 錯誤**。在當前工作樹執行 `pnpm --filter @drts/api typecheck` 整體回傳 **Exit 2**，唯一原因是本機共用 `/home/lupin/workspace/drts-fleet-platform/apps/api/node_modules/nodemailer` 指向之 `.pnpm/nodemailer@10.0.12` 於共用 root `node_modules` 缺漏，致無關檔案 `src/modules/notification-delivery/remote-smtp-mail.transport.ts` 第 1–2 行報 `TS2307: Cannot find module 'nodemailer'`；依規不觸碰 Root WIP 重跑 `pnpm install`，完整 clean-install 全倉 typecheck 由同一 candidate SHA 之 hosted CI 執行驗證。

---

## 4. 範圍與環境限制誠實聲明

- **窄範圍 Source 修復邊界**：本任務僅修復 `C107-F1`（`ServiceProductService` 與 `ServiceProductController` 對 `createServiceProduct`、`updateServiceProduct`、`upsertRuntimeProfilePolicy` 之權威持久化確認與錯誤傳遞鏈，並完整保留無資料庫/記憶體模式之同步行為）。不宣稱單憑本任務即完成完整 `C107` 能力、建立後跨模組多端消費一致性（如 Demo 保留之 regulatory/owned/multi-taxi 消費端）、或全系統 134 項能力驗收。
- **既有治理與地圖證據保留**：`SR-QA-GOVERNANCE-001` 原有 5 項 C107 測試案例與 C114 既有合格範圍證據維持其原有已證明之範圍，未篡改任何財務、資格、地理或審批政策。
- **VM 執行限制**：嚴格遵守 `AGENTS.md` 規範，未在此 VM 上啟動任何產品開發伺服器、預覽伺服器、瀏覽器/E2E 伺服器或 Docker Compose 基礎設施。
