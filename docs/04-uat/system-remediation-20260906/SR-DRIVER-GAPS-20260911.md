# SR-DRIVER-GAPS-20260911 — 司機端四項已確認產品缺口修復

Owner: `Gemini` | Reviewer: `Gemini2` | 日期: `2026-09-13 UTC`

## 1. 追溯與版本資訊 (Version & Traceability)

- **工作分支 (Branch)**: `gemini/sr-driver-gaps-20260911`
- **工作樹路徑 (Worktree)**: `/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-driver-gaps-20260911`
- **規劃參照 (Planning Ref)**: `docs/04-uat/system-remediation-20260906/source/capabilities.json`
- **來源依據**: `SR-QA-DRIVER-001` 直測確認之司機端產品缺口：
  1. **C051**: `shift-attendance.service.ts` `clockIn()` 漏檢司機停權與證照狀態
  2. **C057 & C058**: `billing-settlement.controller.ts` 漏設司機存取防護，且 `DriverStatementRecord` 無 PDF/下載欄位
  3. **C060**: `DriverSettingsService.notificationsEnabled` 對 `AuditNotificationService.recordNotification()` 無實質抑制效果
  4. **C061**: `DriverRegistryRecord` 無駕照到期日期模型，仰賴靜態布林且無到期自動禁派與 T-30 查詢

---

## 2. 交付範圍與修復實作 (Remediation Details)

### 2.1 C051: 班次打卡司機停權與證照檢核 (Shift Attendance Suspension Check)

- **問題根因**: 原 `ShiftAttendanceService.clockIn()` 僅檢查車輛的可派度（`getVehicleDispatchability`），從未查詢司機自身的 `lifecycleStatus`（如 `suspended`）或證照資格（`licensesValid`）。
- **修復實作**:
  - 在 `ShiftAttendanceService.clockIn()` 中注入並調用 `regulatoryRegistryService.assertDriverAuthEligible(command.driverId)`。
  - 當司機處於停權狀態 (`suspended`) 時，直接拋出 HTTP 403 `DRIVER_AUTH_SUSPENDED`。
  - 當司機證照無效或到期 (`!licensesValid`) 時，直接拋出 HTTP 403 `DRIVER_CERT_INVALID`。
  - 確保司機在被停權或證照失效時，無論是否綁定可派車輛，皆無法建立 active 班次。

### 2.2 C057 & C058: 司機收益對帳單本人存取與 PDF 產出 (Driver Statements Access & Artifact)

- **問題根因**:
  - `BillingSettlementController` 的 `POST driver-statements/generate`、`GET driver-statements`、`GET driver-statements/:statementId` 缺乏 `@RequireRealms` / `@CurrentIdentity` 本人限定存取檢查。
  - `BillingSettlementService.getDriverStatement()` 與 `listDriverStatements()` 無 identity/ownership 篩選。
  - `DriverStatementRecord` 未定義下載成品欄位（`artifactUrl`、`artifactDownloadMetadata`），亦無 PDF 生成邏輯。
- **修復實作**:
  - **合約層** (`packages/contracts/src/index.ts`):
    - 為 `DriverStatementRecord` 擴充 `artifactUrl?: string | null` 與 `artifactDownloadMetadata?: ControlledDownloadRecord | null`。
  - **控制器層** (`apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`):
    - `POST driver-statements/generate`: 設定 `@RequireRealms("platform", "ops")` 及 `@RequireScopes("billing:write")`。
    - `GET driver-statements`: 設定 `@RequireRealms("platform", "ops", "driver")`，司機呼叫時強制限定查詢本人 statement。
    - `GET driver-statements/:statementId`: 設定 `@RequireRealms("platform", "ops", "driver")`，司機身分存取非本人帳單時拋出 HTTP 403 `DRIVER_IDENTITY_MISMATCH`。
  - **服務層** (`apps/api/src/modules/billing-settlement/billing-settlement.service.ts`):
    - 實作 `buildDriverStatementPdfRows()` 格式化帳單明細文字。
    - 於 `generateDriverStatements()` 中調用 `this.documentArtifactStore.put()` 寫入 PDF 檔案（採用 `kind: "report"` 遵循儲存層規定），並以 `createControlledDownloadMetadata()` 簽發受控下載連結。
    - 實作 `ensureDriverStatementArtifact()` 確保讀取時自動補齊／展延過期之受控下載簽章。
    - `getDriverStatement(statementId, requestingDriverId?)` 與 `listDriverStatements(periodMonth?, driverId?)` 嚴格限制本人存取。

### 2.3 C060: 通知偏好真實影響送達 (Driver Notification Preference Effect)

- **問題根因**: `DriverSettingsService` 儲存的 `notificationsEnabled` 旗標僅停留在自身服務中，未與事件通知渠道（如 `BillingSettlementService` 產出帳單時呼叫的 `AuditNotificationService.recordNotification`）做任何連動。
- **修復實作** (`apps/api/src/modules/driver-settings/driver-settings.service.ts`):
  - 於 `DriverSettingsService` 建構子中攔截注入之 `AuditNotificationService.recordNotification`。
  - 實作安全解析函數 `extractDriverId()`，從 `recipientUserId`、`message`、`title` 中精確提取目標司機 ID（避免誤判帳單編號如 `DRV-202603-xxx`）。
  - 當司機設定 `notificationsEnabled: false` 時，自動過濾並抑制 `driver_task` 等司機通知管道，不寫入 `notifications` 陣列，確保司機通知匣不會收到已退訂的通知。
  - 提供公開方法 `isNotificationEnabled(driverId)` 與 `shouldDeliverNotification(driverId, channel)`。

### 2.4 C061: 駕照到期日期模型與自動禁派 (Driver License Expiry & Dispatch Blocking)

- **問題根因**: `DriverRegistryRecord` 缺少駕照到期日欄位，仰賴靜態布林值 `licensesValid`，無法依時間前進自動判斷過期並阻斷派單。
- **修復實作**:
  - **合約層** (`packages/contracts/src/index.ts`):
    - 為 `DriverRegistryRecord`、`CreateDriverMasterCommand`、`UpdateDriverMasterLifecycleCommand` 新增 `licenseExpiry`、`professionalDriverLicenseExpiry`、`taxiDriverRegistrationExpiry`。
    - 匯出 `UpdateDriverLicensesCommand` 介面。
  - **服務層** (`apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`):
    - `createSeedDriver()` 預設填入種子司機之有效到期日 (`2027-12-31T23:59:59.000Z`)。
    - `provisionDriverFromDraft()` 與 `createDriver()` 正確繼承駕照到期日。
    - 實作 `areDriverLicensesValid(driver, referenceDateMs)` 輔助函數；於 `decorateDriver()` 中進行動態時間比對：若任何駕照到期日已小於等於參考時間，動態將 `licensesValid` 設為 `false`，於 `eligibilityBlockedReasons` 加入 `"licenses_invalid"`，並將 `dispatchEligible` 設為 `false`。
    - 實作 `listExpiringDriverLicenses(windowDays, referenceDateMs)` 提供 T-30、T-7 到期預警查詢。
    - 實作 `updateDriverLicenses(driverId, command, requestId)` 支援證照狀態與到期日更新及審計記錄。
  - **控制器層** (`apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`):
    - 新增 `GET /regulatory-registry/drivers/expiring-licenses?windowDays=30` 路由。
    - 新增 `POST /regulatory-registry/drivers/:driverId/licenses` 路由。

---

## 3. 測試與驗證結果 (Verification & Test Evidence)

### 3.1 驗收測試翻轉 (Flipped SR-QA-DRIVER-001 Tests)

將 `tests/unit/system-remediation/sr-qa-driver-001/` 中的 4 個 `CURRENT-BEHAVIOUR-FINDING` 測試翻轉為驗證修復後的正確行為：

1. `shift-clockin-suspension-gap.test.ts`: 驗證停權司機打卡被拒絕（403 `DRIVER_AUTH_SUSPENDED`）。
2. `driver-earnings-statement-access.test.ts`: 驗證 `getDriverStatement` 阻擋身分不符（403 `DRIVER_IDENTITY_MISMATCH`），並驗證帳單具備 `artifactUrl` 與 `artifactDownloadMetadata`（`kind: "report"`）。
3. `driver-settings-notification-effect.test.ts`: 驗證 `notificationsEnabled: false` 司機之通知被確實抑制，`true` 司機正常送達。
4. `driver-license-expiry-gap.test.ts`: 驗證到期日欄位存在，過期自動阻斷派單與驗證（403 `DRIVER_CERT_INVALID`），且 `listExpiringDriverLicenses(30)` 正常運作。

執行指令：

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-qa-driver-001/
```

結果：**7 個測試檔、32 個測試全部 PASS**。

### 3.2 專屬補救測試套件 (Remediation Test Suite)

新增 `tests/unit/system-remediation/sr-driver-gaps-20260911/driver-gaps-remediation.test.ts`，涵蓋正向、反向、到期時間視窗、身分防護、下載 Metadata 產生共 10 項測試：

- Gap 1: 正常打卡 (Positive)、停權打卡 (Negative: 403 `DRIVER_AUTH_SUSPENDED`)、證照失效打卡 (Negative: 403 `DRIVER_CERT_INVALID`)。
- Gap 2: 本人讀取帳單 (Positive)、他人讀取帳單 (Negative: 403 `DRIVER_IDENTITY_MISMATCH`)、PDF 成品生成與受控下載簽章。
- Gap 3: 通知關閉抑制 (Negative)、通知開啟正常送達 (Positive)。
- Gap 4: 證照到期阻斷派單 (Negative: 403 `DRIVER_CERT_INVALID`)、T-30 時間視窗篩選。

執行指令：

```bash
pnpm exec vitest run tests/unit/system-remediation/sr-driver-gaps-20260911/driver-gaps-remediation.test.ts
```

結果：**10 個測試全部 PASS**。

### 3.3 型別檢查 (Typecheck)

- `pnpm --filter @drts/contracts build`: PASS (exit code 0)
- `pnpm --filter @drts/api typecheck`: PASS (exit code 0)

---

## 4. 交付異動檔案清單 (File Inventory)

- `packages/contracts/src/index.ts`: 擴充 `DriverRegistryRecord`、`CreateDriverMasterCommand`、`UpdateDriverMasterLifecycleCommand`、`UpdateDriverLicensesCommand`、`DriverStatementRecord`
- `apps/api/src/modules/shift-attendance/shift-attendance.service.ts`: `clockIn()` 增加 `assertDriverAuthEligible()`
- `apps/api/src/modules/billing-settlement/billing-settlement.controller.ts`: 補齊 `@RequireRealms` 與司機本人 identity 驗證
- `apps/api/src/modules/billing-settlement/billing-settlement.service.ts`: 實作 PDF 生成、受控下載簽章、本人存取隔離
- `apps/api/src/modules/driver-settings/driver-settings.service.ts`: 實作通知攔截與抑制邏輯
- `apps/api/src/modules/regulatory-registry/regulatory-registry.service.ts`: 實作證照到期日動態比對、禁派阻斷、T-30 查詢、更新介面
- `apps/api/src/modules/regulatory-registry/regulatory-registry.controller.ts`: 新增證照更新與過期查詢路由
- `tests/unit/system-remediation/sr-qa-driver-001/*.test.ts`: 翻轉 4 項缺口測試
- `tests/unit/system-remediation/sr-driver-gaps-20260911/driver-gaps-remediation.test.ts`: 專屬全功能驗證測試
- `docs/04-uat/system-remediation-20260906/SR-DRIVER-GAPS-20260911.md`: 本驗收與設計文件
