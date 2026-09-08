# SR-ADMIN-ADAPTER-001 — 平台轉接器登錄 API 接線及到期真值

- **任務編號**：`SR-ADMIN-ADAPTER-001`
- **Owner**：`Gemini`
- **Reviewer**：`Codex2`
- **狀態**：`in_progress`（準備提交 handoff）
- **日期**：2026-09-08
- **工作分支**：`gemini/sr-admin-adapter-001`
- **Base SHA**：`d44bd281483ea4e645939ae8da2c34346ca82c5e`（對齊最新 `origin/dev`）
- **關聯規格**：`docs/04-uat/system-remediation-20260906/source/capabilities.json`（C097, R07）

---

## 1. 任務背景與問題根因

1. **API 404 缺失**：
   `/adapter-registry` 頁面透過 `ApiClient` 呼叫後端 `/api/platform-admin/adapters`，但後端 `PlatformAdminController` 與 `PlatformAdminService` 尚未實作轉接器端點，導致請求直接回傳 404 Not Found。
2. **假警示 Banner 殘留**：
   在 API 失敗、載入中或轉接器清單為空時，前端未進行適當防護，而是 fallback 顯示硬編碼的靜態警告「mof-bgmt token expires in 6 days · 2026-05-31」，造成系統在無資料或異常時仍呈現虛假警告。
3. **憑證到期未依真值計算**：
   缺乏對實際時間戳記（ISO timestamp）與參考時間（reference date）進行比對的四種到期真值狀態（`valid` 未到期, `expiring_soon` 即將到期, `expired` 已到期, `unknown` 未知）。

---

## 2. 核心修正內容

### 後端 API 與治理（apps/api）
- **`PlatformAdminService`**：
  - 建立轉接器真值資料種子，包含 `owned-dispatch`、`cityride-forwarder`、`srx-v3`、`gocab-v1`、`mof-bgmt`（具備真實到期時間戳記）、`grab_taiwan` 等。
  - 實作 `listPlatformAdapters`、`getPlatformAdapter`、`updatePlatformAdapter`、`createPlatformAdapter` 與資料隔離複製。
  - 在修改操作時安全記錄審計日誌（`recordAudit` 檢查 `auditNotificationService` 可用性，記錄 `resourceType: "platform_adapter"`）。
- **`PlatformAdminController`**：
  - 實作 `@Get("adapters")`、`@Get("adapters/:adapterId")`、`@Patch("adapters/:adapterId")`、`@Post("adapters")` 端點。
  - 實作 `assertAuthorizedRole`：限制僅允許 `platform` 與 `system` realm 存取；讀取需具備 `foundation:read`，寫入需具備 `foundation:write`；未授權角色（如 `driver`、`tenant`）或缺少權限一律回傳 403 `PLATFORM_ADMIN_FORBIDDEN`。
  - 不存在的轉接器回傳 404 `PLATFORM_ADAPTER_NOT_FOUND`。

### 前端 UI 與真值計算（apps/platform-admin-web）
- **`credential-expiry.ts`**：
  - 實作 `evaluateCredentialExpiry(adapterOrExpiresAt, referenceDate, warningThresholdDays)`。
  - 根據真實時間戳記計算剩餘天數 `daysRemaining`，正確判定四種狀態：
    - `valid`：剩餘天數大於預警天數（預設 30 天）。
    - `expiring_soon`：剩餘天數介於 1 至預警天數。
    - `expired`：剩餘天數 <= 0 或 `credentialStatus === "EXPIRED"`。
    - `unknown`：時間戳記缺失或格式無效。
- **`page.tsx`**：
  - 整合 `usePlatformAdminClient` 進行真值載入。
  - **徹底移除硬編碼 fallback banner**：僅在 `!loading && !error && attentionAdapter` 條件滿足時顯示警示橫幅；API 載入中、錯誤或全部轉接器健康正常時，橫幅完全隱藏，絕不顯示假警示。
  - 警示橫幅文字動態注入轉接器名稱、真實到期日期與真實剩餘天數。
  - 卡片呈現真實憑證狀態 Pill（未到期、即將到期（Xd）、已到期、未知）及格式化日期。
  - 接線 `EditAdapterModal`，點擊「編輯設定」可開啟視窗進行政策、啟用狀態與 Rollout 調整，並儲存至後端 API。
- **`translations.ts`**：
  - 維護本地雙語字串字典，檔名符合 `i18n-guard.mjs` 規範。

---

## 3. 測試與驗證證據

所有驗證指令均在指派工作目錄執行：
`/home/lupin/workspace/drts-fleet-platform/.artifacts/worktrees/auto/gemini-sr-admin-adapter-001`

| 驗證項目 / 指令 | Exit Code | 測試內容與實際結果 |
|---|:---:|---|
| `node tools/ci/i18n-guard.mjs` | 0 | 521 files scanned across 10 apps, 55 exemption(s), 無 inline-bilingual-map 違規 |
| `pnpm --filter @drts/api typecheck` | 0 | API 模組 TypeScript 編譯無錯誤（`tsc -p tsconfig.json --noEmit` 通過） |
| `pnpm --filter @drts/platform-admin-web typecheck` | 0 | Next.js 路由型別產生成功，前端 TypeScript 編譯無錯誤 |
| `git diff --check` | 0 | 無空白字元與排版錯誤 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/credential-expiry.test.ts` | 0 | 10 passed：4種狀態驗證、時間軸平移（T-60 -> T-30 -> T+1）狀態切換、自訂門檻 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/adapter-registry-api.test.ts` | 0 | 14 passed：後端 API 列表、單筆讀取、PATCH 更新回讀、POST 建立、401/403 權限防護、404、審計日誌記錄 |
| `pnpm exec vitest run tests/unit/system-remediation/sr-admin-adapter-001/adapter-registry-ui-contract.test.ts` | 0 | 7 passed：消除 2026-05-31/6天假橫幅、loading/error 橫幅抑制、動態警示字串驗證 |
| **完整 Vitest 套件執行** | **0** | **3 files / 31 passed (100% 通過)** |

### 測試涉及之 Resource IDs
- `owned-dispatch`（自有調度引擎）
- `cityride-forwarder`（CityRide 轉發器）
- `srx-v3`（SRX 外部介接器）
- `gocab-v1`（GoCab 轉接器）
- `mof-bgmt`（財政部多元計程車申報介接）
- `grab_taiwan`（Grab 台灣介接）
- `tw-metro-transit`（動態建立之捷運整合轉接器）

---

## 4. 嚴格邊界與未涵蓋範圍聲明

1. **嚴格限制在指定 write_scopes 內**：
   - `apps/platform-admin-web/app/adapter-registry/`
   - `apps/api/src/modules/platform-admin/platform-admin.controller.ts`
   - `apps/api/src/modules/platform-admin/platform-admin.service.ts`
   - `tests/unit/system-remediation/sr-admin-adapter-001/`
   - `docs/04-uat/system-remediation-20260906/SR-ADMIN-ADAPTER-001.md`
   未修改任何 shared contracts、runtime config 或其他任務之目錄。
2. **本地驗證與生產環境界線**：
   本證據文件僅代表當前工作分支在單元測試、型別檢查、i18n-guard 與本地契約層級的真值驗證通過；尚未包含雲端 live CI pipeline 完整執行、多節點分散式佈署或真機端點驗收。
