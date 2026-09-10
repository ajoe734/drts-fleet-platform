# SR-CONTRACT-READ-001 — Ops 合約 read model 補真營運條款

Owner：Gemini；Reviewer：Codex2。日期：2026-09-10 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`gemini/sr-contract-read-001`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-contract-read-001`
- **基準 SHA (Base SHA)**：`8ee0afcce19a74ec1b5c928424a13d7494f4a34b` (`origin/dev`)
- **候選 SHA (Candidate SHA)**：於 `handoff` 時以 `git rev-parse HEAD` 寫入鎖定（見 task board 與 machine truth）
- **任務類型與工作流**：Priority P1 / Workstream `contract` / Class `implementation` / Serial Resource `registry-controller`
- **規劃參照 (Planning Reference)**：
  - `docs/04-uat/system-remediation-20260906/source/capabilities.json` (`C134`: 調度與營運 — 合約詳情可進入並提供執行條款)
  - `docs/04-uat/system-remediation-20260906/source/new-gaps.json` (`N14`: 合約詳情缺少執行派車所需營運條款)
  - `docs/04-uat/system-remediation-20260906/source/findings.json`
  - `docs/03-runbooks/system-remediation-20260906/SR-CONTRACT-READ-001.md`
- **功能項目追溯 (Feature Traceability)**：
  - **Ops 合約營運條款唯讀模型 (`ContractOperationalViewRecord`)**：提供派車執行所需的 7 大條款：可修改時窗 (`modifiableWindow`)、憑證要求 (`proofRequirements`)、等候規則 (`waitingRule`)、No-show 規則 (`noShowRule`)、SLA 設定檔 (`slaProfile`)、目前生效版本 (`effectiveVersion`)、授權模式 (`authMode`)。
  - **扁平營運條款模型 (`ContractOperationalTerms`)**：提供向下相容與輕量查詢所需之唯讀條款摘要。
  - **三大資料狀態嚴格區分**：清楚劃分 `available`（條款完備可用）、`not_applicable`（依商品型態與營運範疇不適用）、`missing_data`（存在具體模型缺口／渠道權威未設定），嚴禁填入假預設或硬編碼固定百分比。
  - **跨 Scope 安全隔離防護**：依 `tenantId`、`partnerId`、`serviceScope` 實施跨範圍合約防洩漏檢核，未授權跨邊界存取一律回傳 HTTP 403 `CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN`。
- **相依與前置任務繼承**：
  - 前置任務 `SR-CONTRACT-001` 已 canonical merge（merge commit `e6415ede5aebc2fb280cf8f2871ee55e460a4b6e`），其定義之 `@drts/contracts` 型別與 `docs/04-api/openapi-spec.yaml` OAS 3.0.3 Schemas 為本任務之權威契約基石。
  - 下游依賴任務 `SR-OPS-CONTRACT-001`（合約清單接詳情並呈現可用條款）依賴本任務提供之端點與 Read Model 投影。

---

## 2. 驗證執行紀錄與實際結果 (Verification Evidence)

所有指令皆於隔離任務工作樹內執行，完全符合派工範圍限制，未修改 `write_scopes` 以外之任何檔案。

| 檢查項目 / 指令                                                                       | Exit Code | 耗時  | 實際結果摘要                                                      |
| :------------------------------------------------------------------------------------ | :-------: | :---: | :---------------------------------------------------------------- |
| `git diff --check`                                                                    |     0     | 0.05s | 工作目錄零 whitespace error                                       |
| `pnpm --filter @drts/api typecheck`                                                   |     0     | 4.2s  | `@drts/api` TypeScript 編譯檢查通過（零型別錯誤）                 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-contract-read-001/`            |     0     | 2.58s | 1 test file, 19 passed (100% 通過，0 失敗)                        |
| `pnpm exec vitest run tests/unit/system-remediation/sr-contract-001/`                 |     0     | 1.11s | 1 test file, 32 passed (100% 通過，前置契約回歸驗證無損)          |
| `pnpm --filter @drts/api test tests/unit/regulatory-registry.controller.test.ts`      |     0     | 2.77s | 1 test file, 2 passed (既有監管名冊 Controller 單元測試零回歸)    |

### 測試覆蓋矩陣 (19 Unit Tests in Suite)

1. **既有合約映射與權威來源對齊 (N14 / C134)**：
   - `contract-demo-001` (`standard_taxi`)：即時叫車無需修改時窗 (`not_applicable`)、無簽收存證需求 (`not_applicable`)、等候寬限 5 分鐘 (`available`)、No-show 閾值 10 分鐘 (`available`)、SLA 設定檔 `sla_standard_taxi_taichung-port` (`available`)、生效版本 `v1.0` (`available`)、夥伴渠道未建檔明確標示 `missing_data` (`authMode: null`)。
   - 扁平化投影：正確輸出 `ContractOperationalTerms`，整筆狀態反映 `missing_data`，絕不遮掩缺口。
   - `contract-demo-004` (`business_dispatch`)：商務派單出車前 30 分鐘截止修改 (`leadTimeMinutes: 120, cutoffMinutes: 30`)、照片與行程存證 (`photo`, `booking_confirmation`)、等候規則 15 分鐘、No-show 20 分鐘計費、SLA 設定檔 `sla_enterprise_taichung-port`。
   - `contract-av-demo-001` (AV 自動駕駛商務派單)：自駕任務專屬修改時窗描述、自駕專屬遙測與鏡頭存證 (`telemetry_log`, `camera_snapshot`)，免司機簽名 (`signatureRequired: false`)。
2. **TenantPartner 權威整合 (Tenant Partner Authority Linkage)**：
   - 透過 `partnerId: "partner-bank-demo-001"` 連結之合約，自動自 `TenantPartnerService` 取得 `authMode: { mode: "partner_api_key", eligibilityMode: "bank_card_inline" }`。
   - SLA 設定檔自動結合租戶專屬門檻 (`waitThresholdMin: 10`, `arrivalThresholdMin: 15`) 與商務子類型 `credit_card_airport_transfer`。
   - 機場接送專屬修改時窗 (`cutoffMinutes: 60`) 與存證要求 (`photo`, `signoff`) 均為 `available`。
3. **三大狀態區分與無假預設 (Status Distinction & No Fake Defaults)**：
   - 未設定之客製合約範疇所有營運條款均為 `null` 且標記 `missing_data`，嚴禁產生虛構之等候或時窗數字。
   - 車主直營 (`individual_owner`) 與車行租賃 (`fleet_partner`) 條款精確區分不適用 (`not_applicable`) 與車行入口 (`fleet_partner_portal`)。
4. **生命週期與版本追溯 (Traceable Lifecycle & Version Tracking)**：
   - 合約初建時版本為 `v1.0`（`versionNumber: 1`），有效期間精確吻合 `startAt` 與 `endAt`。
   - 合約經 `activateContract` 核准後，版本自動演進為 `v2.0`（`versionNumber: 2`），生效起點精確追溯至核准時間。
5. **跨 Scope 安全隔離防護 (Cross-Scope Isolation & Protection)**：
   - 跨夥伴存取 (`partnerId` 不符)：拋出 HTTP 403 `CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN`。
   - 跨服務範圍存取 (`serviceScope` 不符)：拋出 HTTP 403 `CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN`。
   - 跨租戶存取 (`tenantId` 不符)：拋出 HTTP 403 `CONTRACT_OPERATIONAL_SCOPE_FORBIDDEN`。
   - 合約不存在：拋出 HTTP 404 `CONTRACT_OPERATIONAL_VIEW_NOT_FOUND`。
   - 依範圍過濾清單：`listOperationalViews` 自動剔除超出調度員範疇之合約。
6. **Controller 端點與 API 封套 (Controller Endpoints & Envelopes)**：
   - `GET /regulatory-registry/contracts/:contractId/operational-view`：回傳標準 `ApiSuccessEnvelope<ContractOperationalViewRecord>`。
   - `GET /regulatory-registry/contracts/:contractId/operational-terms`：回傳標準 `ApiSuccessEnvelope<ContractOperationalTerms>`。
   - `GET /regulatory-registry/contracts/:contractId`：回傳標準單筆合約紀錄並落實 Scope 驗證。
   - 支援標頭與查詢參數之 Scope 傳遞（`x-tenant-id`, `x-partner-id`, `x-service-scope`）。
7. **OpenAPI 3.0.3 Ajv 正向 Schema 驗證**：
   - 經由標準 OAS 3.0.3 Ajv 解析器載入 `openapi-spec.yaml`。
   - 驗證所有由服務與控制器產出之 `ContractOperationalViewRecord`、`ContractOperationalTerms`、`ContractOperationalViewEnvelope`、`ContractOperationalTermsEnvelope`，驗證結果全數為 `valid: true`（0 錯誤）。

---

## 3. 變更範圍守護 (Write Scopes Compliance)

本任務嚴格限制在指定的 5 個 `write_scopes` 範圍內進行修改與新增：

1. `apps/api/src/modules/regulatory-registry/contract-operational-view.service.ts`（新建）：核心營運條款投影服務，實作租戶／夥伴條款映射、三態狀態標記、版本追溯與跨 Scope 安全隔離。
2. `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`（修改）：掛載 3 個新端點（`/operational-view`, `/operational-terms`, `/:contractId`），以 `@Optional()` 保持向下相容性。
3. `apps/api/src/modules/regulatory-registry/regulatory-registry.module.ts`（修改）：以 `forwardRef(() => TenantPartnerModule)` 匯入租戶夥伴模組，註冊並匯出 `ContractOperationalViewService`。
4. `tests/unit/system-remediation/sr-contract-read-001/sr-contract-read-001.test.ts`（新建）：19 項完整且具備行為意義的單元與合約驗證測試。
5. `docs/04-uat/system-remediation-20260906/SR-CONTRACT-READ-001.md`（新建）：本執行、驗證與追溯證據文件。

---

## 4. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions)

依據系統補救與安全治理規範，本任務具備明確邊界限制，以下項目明示排除於本任務之外，不冒稱已完成實機驗收：

- **VM 限制遵守**：未啟動任何產品開發伺服器 (`pnpm dev`)、端對端瀏覽器測試伺服器 (`playwright test` / `pnpm exec playwright`) 或 Docker Compose 容器基礎設施。
- **無實體車載硬體或 OBD/CAN 遙測連線**：AV 自動駕駛之遙測存證與相機快照為投影契約與驗證資料結構，未連線至真實自駕車輛車載端點。
- **無生產資料庫 DDL 異動**：本任務為唯讀投影 Read Model 實作，沿用既有權威資料結構，未執行未核定之 SQL Migration。
- **定價真值守護不變量**：合約條款僅投影派單時窗、等候、No-show 與存證門檻；費率、里程加價與抽成分潤由計費結算引擎（`BillingSettlementService` / `PricingPlan`）獨立管理，本 Read Model 嚴禁複製、覆寫或捏造定價真值。
- **前端畫面由下游任務實現**：合約清單進入詳情並呈現本 Read Model 之前端頁面接線，由下游相依任務 `SR-OPS-CONTRACT-001` 負責。
