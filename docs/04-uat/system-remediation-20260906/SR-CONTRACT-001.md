# SR-CONTRACT-001 — 一次整合新增功能契約與保留 migration 範圍

Owner：Gemini；Reviewer：Codex2。日期：2026-09-09 UTC。

## 1. 版本與追溯 (Version & Traceability)

- **工作分支 (Branch)**：`gemini/sr-contract-001`
- **工作樹目錄 (Worktree)**：`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-contract-001`
- **基準 SHA (Base SHA)**：`396904179665a3b602d25931c4db6a2d006fb812` (`origin/dev`)
- **任務類型與工作流**：Priority P2 / Workstream `contract` / Class `implementation`
- **規劃參照 (Planning Reference)**：
  - `docs/04-uat/system-remediation-20260906/source/capabilities.json`
  - `docs/04-uat/system-remediation-20260906/source/findings.json`
- **功能項目追溯 (Feature Traceability)**：
  - **Driver Leave**：`N01` / `C052` (司機請假申請、審核、歷史與取消)
  - **Driver Academy**：`N02` / `C059` / `C071` (司機教育培訓、測驗模組、通過驗證與車隊培訓彙總)
  - **Host Vehicle Restricted Projection**：`N03` / `C012` (靠行車主受限車輛唯讀投影、維護狀態、案件追蹤與收益摘要)
  - **Contract Operational Terms**：`N14` / `C134` (契約條款與營運條件關聯投影)
- **相依與前置任務繼承**：
  - 繼承 `SR-REPORT-001` 匯出格式不變量：`IMPLEMENTED_REPORT_OUTPUT_FORMATS = ["csv", "xlsx", "pdf"]`，嚴禁退回僅支援 CSV。
  - 避讓 Unattended Voice (`UV-EXEC`) migration 範圍：`V0086`–`V0093` (`V0093__voice_retention_and_legal_hold.sql`)。
  - 邊界治理不變量：根模組 `apps/api/src/app.module.ts` 之註冊與裝配由 `SR-WIRE-001` 專屬負責，本契約任務嚴禁觸碰。

---

## 2. 驗證執行紀錄與實際結果 (Verification Evidence)

所有檢查均自隔離工作樹執行，完全符合派工範圍限制，未修改 `write_scopes` 以外之任何檔案。

| 檢查項目 / 指令                                                       | Exit Code | 耗時  | 實際結果摘要                                               |
| :-------------------------------------------------------------------- | :-------: | :---: | :--------------------------------------------------------- |
| `git diff --check`                                                    |     0     | 0.05s | 無任何 whitespace error 或格式異常                         |
| `pnpm lint:root`                                                      |     0     | 3.2s  | ESLint 根目錄與單元測試檢查零警告零錯誤                    |
| `pnpm --filter @drts/contracts typecheck`                             |     0     | 2.1s  | `@drts/contracts` TypeScript 編譯檢查通過（無 emit 錯誤）  |
| `pnpm --filter @drts/api-client typecheck`                            |     0     | 2.2s  | `@drts/api-client` TypeScript 編譯檢查通過（無 emit 錯誤） |
| `pnpm exec vitest run tests/unit/system-remediation/sr-contract-001/` |     0     | 0.75s | 1 test file, 30 passed (100% 通過，0 失敗)                 |
| `pnpm exec vitest run tests/unit/api-client-dispatch-queue.test.ts`   |     0     | 0.55s | 既有 api-client / contracts 測試回歸守護通過 (2 passed)    |

### 測試覆蓋矩陣 (30 Unit Tests in Suite)

1. **Schema Allocation Invariants (`schema-allocation.json`)**：
   - 驗證 `schema-allocation.json` 存在且格式符合規範。
   - 驗證 migration 編號自 `V0094` 連續遞增（`V0094` Driver Leave、`V0095` Driver Academy、`V0096` Host Vehicles），與 UV-EXEC (`V0086`–`V0093`) 零衝突。
   - 實作安全之磁碟防碰撞檢核：驗證分配版本嚴格大於 `V0093`，且磁碟上若存在對應序號之檔案時，檔名必須精確吻合核定檔名（`V0094__sr_driver_leave.sql`、`V0095__sr_driver_academy.sql`、`V0096__sr_host_vehicle_access.sql`），避免依賴任務交付 migration 時破壞根單元 CI。
   - 驗證明確記載邊界不變量（`app.module.ts` 註冊保留予 `SR-WIRE-001`）與治理規則。
2. **`@drts/contracts` 型別與常數不變量**：
   - 匯出完整請假類型 (`annual`, `sick`, `personal`, `bereavement`, `emergency`) 與狀態 (`pending`, `approved`, `rejected`, `withdrawn`)。
   - 匯出培訓狀態 (`not_started`, `in_progress`, `passed`, `failed`, `expired`) 與模組分類。
   - 匯出車主車輛維護狀態與案件分類/狀態枚舉。
   - 匯出完整的 `SYSTEM_REMEDIATION_ERROR_CODES`，含括 4 大領域之錯誤代碼。
   - 嚴格守護 `IMPLEMENTED_REPORT_OUTPUT_FORMATS` 包含 `csv`, `xlsx`, `pdf`。
   - 結構型別斷言：`DriverLeaveRecord`, `AcademyCourseDetail`, `HostVehicleSummary`, `HostVehicleEarningsSummary`, `ContractOperationalViewRecord`。
   - 車主收益模型斷言：Phase 1 `fleetCommission` 與 `netEarnings` 必須維持 `null`，`settlementStatus` 為 `pending_policy`，杜絕虛構分潤演算法。
   - 車輛 VIN 斷言：強制符合遮罩格式（例如前 8 碼星號 `********AB123456`）。
3. **`@drts/api-client` 傳輸層與方法契約**：
   - 於 `ApiClient` 實作 18 個型別安全方法，並支援清單封套與詳細資料模型。
   - `createDriverLeave` 發送 `POST /api/driver-leave/requests` 並解包回應資料。
   - `listDriverLeaves` 正確序列化分頁與篩選參數，並支援清單封套與一般封套。
   - `withdrawDriverLeave` (`POST /withdraw`) 與 `reviewDriverLeave` (`POST /review`) 正確路由至特定子路徑。
   - `listAcademyCourses`, `getAcademyCourse`, `submitQuiz`, `getDriverQuizAttempt`, `getFleetTrainingSummary`, `listFleetDriverRoster`, `getFleetDriverQuizAttempt` 正確分發並傳遞 payload。
   - `listHostVehicles`, `getHostVehicleEarnings`, `listHostVehicleMaintenance`, `listHostVehicleTrips`, `listHostVehicleCases` 正確路由並支援查詢條件。
   - `createHostClient` 工廠方法正確設定 partner realm 與 actor 標頭。
   - 獨立 functional adapters (`createDriverLeaveRequest`, `listDriverLeaveRequests`, `getAcademyCourses`, `getHostOwnedVehicles` 等) 正常操作。
4. **OpenAPI 規格對齊與 Ajv 正負向驗證 (`openapi-spec.yaml`)**：
   - 包含所有 15 個新增 path operations 與 4 個新增 Tags (`DriverLeave`, `DriverAcademy`, `FleetPartnerTraining`, `HostVehicles`)。
   - 包含所有對應之請求／回應 Schemas、Envelope 結構與 `MethodNotAllowed` (HTTP 405) 回應定義。
   - **Codex2 審查修復：巢狀結構與必要 nullable 欄位嚴格對齊**：
     - 新增 `ContractOperationalModifiableWindow`, `ContractOperationalProofRequirements`, `ContractOperationalWaitingRule`, `ContractOperationalNoShowRule`, `ContractOperationalSlaProfile`, `ContractOperationalEffectiveVersion`, `ContractOperationalAuthMode`, `ContractOperationalFieldStatusMap` 等具體約束 Schema，取代無約束之 `type: object`。
     - 於各模型 `required` 清單中納入所有在 TS 契約為必要之 nullable 欄位（例如 `DriverLeaveRecord` 之 `reviewedByPrincipalId`/`reviewedAt`/`reviewNotes`、`HostVehicleSummary` 之 `contractPeriod`、`DriverTrainingRecord` 之 `highestScore`/`completedAt`/`expiresAt`/`lastAttemptAt`、`FleetDriverRosterItem` 之 `score`/`completedAt`/`latestAttemptId`、`ContractOperationalTerms` 之各項條款欄位）。
   - **Ajv 8.x 架構級正負向回歸驗證**：
     - 正向檢驗：完整資料 payload 與具備合法 `null` 之 payload 均通過 schema 驗證。
     - 負向檢驗：精確重現並阻擋未受約束的空物件（如 `{contractId: "contract-1", dataStatus: {}, modifiableWindow: {}}` 必定拒絕並回報遺漏必要屬性）。
     - 負向檢驗：缺漏必要 nullable 欄位（如遺漏 `reviewedByPrincipalId`、`contractPeriod`、`highestScore` 等）必定判定為非合法 payload。

---

## 3. Migration 範圍分配清單 (`schema-allocation.json`)

為避免後續後端實作任務 (`SR-LEAVE-BE-001`, `SR-ACADEMY-BE-001`, `SR-HOST-BE-001`) 發生 migration 序號衝突，建立權威保留表如下：

```json
{
  "wave": "system-remediation-20260906",
  "baseSha": "396904179665a3b602d25931c4db6a2d006fb812",
  "allocatedMigrations": [
    {
      "sequence": "V0094",
      "filename": "V0094__sr_driver_leave.sql",
      "task": "SR-LEAVE-BE-001",
      "domain": "Driver Leave Requests & Approvals",
      "targetTables": ["ops.phase1_driver_leave_requests"]
    },
    {
      "sequence": "V0095",
      "filename": "V0095__sr_driver_academy.sql",
      "task": "SR-ACADEMY-BE-001",
      "domain": "Driver Academy Modules & Quiz Records",
      "targetTables": [
        "reg.phase1_driver_academy_modules",
        "reg.phase1_driver_academy_quizzes",
        "reg.phase1_driver_academy_attempts"
      ]
    },
    {
      "sequence": "V0096",
      "filename": "V0096__sr_host_vehicle_access.sql",
      "task": "SR-HOST-BE-001",
      "domain": "Host Vehicle Restricted Projections",
      "targetTables": ["ops.phase1_host_vehicle_projections"]
    }
  ]
}
```

---

## 4. 變更範圍守護 (Write Scopes Compliance)

本任務僅在指定的 8 個 `write_scopes` 範圍內進行修改與新增：

1. `docs/04-api/openapi-spec.yaml`：擴充 4 個 Tag、15 個 API 端點與完整資料 Schema。
2. `docs/04-uat/system-remediation-20260906/schema-allocation.json`：建立 migration 序號保留與架構約束。
3. `packages/contracts/src/system-remediation.ts`：定義領域模型、枚舉、錯誤碼與唯讀投影契約。
4. `packages/contracts/src/index.ts`：匯出 system-remediation 契約。
5. `packages/api-client/src/system-remediation.ts`：定義 API Client 介面與功能適配器。
6. `packages/api-client/src/index.ts`：於 `ApiClient` 實作 18 個型別安全方法與 `createHostClient`。
7. `tests/unit/system-remediation/sr-contract-001/sr-contract-001.test.ts`：完整的自動化單元測試。
8. `docs/04-uat/system-remediation-20260906/SR-CONTRACT-001.md`：本執行與回歸證據文件。

---

## 5. 驗證界線與非即時排除聲明 (Boundaries & Non-Live Exclusions)

依據系統補救與安全治理規範，本契約任務具備明確邊界限制，以下項目明示排除於本任務之外，不冒稱已完成實機驗收：

- **無實體行動硬體測試**：未在實體 Android/iOS 手機設備上安裝 APK/IPA 或操作真實觸碰介面。
- **無車載硬體或 OBD/CAN 遙測連線**：車輛里程、油耗、維護狀態均為展示契約與投影結構，未對接實體車輛硬體端點。
- **無外部真實簡訊/Email 發送**：審核通過或培訓過期之通知僅定義通知狀態與事件 payload 結構，未觸發外部第三方 SMS/SES/SendGrid 發信。
- **無線上正式資料庫 DDL 執行**：僅完成 migration 序號分配清單與資料表規格保留，未對 production/staging 執行 `FLYWAY MIGRATE`。
- **無後端路由註冊與前端頁面實作**：後端 controller/service 裝配保留給各專屬 BE 任務與 `SR-WIRE-001`，前端管理介面保留給各專屬 FE 任務。
- **車主分潤財務不變量**：因尚未有營運策略簽署，Phase 1 之車主收益投影維持 `fleetCommission: null`, `netEarnings: null`, `settlementStatus: "pending_policy"`，嚴禁偽造或猜測分潤比例。

---

## 6. 交接資訊 (Handoff)

- **狀態 (Status)**：等待 Review (`Codex2`)
- **交接指令 (Handoff Command)**：由 Owner 提交 commit 並普通推送至遠端分支後，執行 `ai-status.sh handoff SR-CONTRACT-001 Codex2`。
