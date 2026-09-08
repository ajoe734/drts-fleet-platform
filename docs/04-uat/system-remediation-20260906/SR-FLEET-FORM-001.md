# SR-FLEET-FORM-001 — 供給表單可及性及未儲存草稿

| 欄位              | 內容                                                 |
| ----------------- | ---------------------------------------------------- |
| Phase             | system-remediation-20260906                          |
| Owner             | Gemini                                               |
| Reviewer          | Codex2                                               |
| Base SHA          | `1cdaaa5b5e5301de2da0a692c78c4cc29b0c10a9` (origin/dev, historical audit base `b32ab8badb740b94cdf67212315ecfccf21f6d5d`) |
| Gap IDs           | R23, R25                                             |
| Capability IDs    | C070, C120                                           |
| Status            | candidate (handoff pending review)                   |

## 驗收條件與實作摘要

### AC1 — 鍵盤完成新增表單，欄位有 accessible name 及可讀錯誤

**已實作：**
- 新增 `FormField` 組件（`fleet-supply-workspace.tsx`），替換 `CanvasField` 用於新增/編輯表單（移除未使用的 `CanvasField` import 以通過 eslint/smoke）。
  - `FormField` 輸出 `<label htmlFor={id}>` + `<input id={id}>`，建立明確 label↔input 關聯（WCAG 1.3.1, 4.1.2）。
  - 錯誤訊息在 `id="${id}-error"` + `role="alert"` 的 `<div>` 內，供 AT 即時播報。
  - 必填欄位使用 `aria-hidden="true"` 之星號視覺標記，移除 inline 假字串以遵循 `i18n-guard` 規格。
- `DriverDraftFields` / `VehicleDraftFields` 全部欄位改用 `FormField`，`formKey` prop 控制每個表單實例的 id 前綴（`new-driver` / `new-vehicle` / `detail`）。
- 文件上傳卡內 `docType`、`docFile`、`docFrom`、`docUntil` 也改用 `FormField`。
- 加入 `fieldId(form, field)` helper（`fleet-portal-supply.ts`），返回 `"form-{form}-{field}"` 格式的穩定 id 字串。
- `ProductChecklist` 組（checkbox 群組）改用 `role="group"` + `aria-labelledby` 提供群組標籤。
- 行動裝置鍵盤提示：文字欄位加 `inputMode="text"`，電話加 `type="tel"` + `inputMode="tel"` + `autoComplete="tel"`，數字欄位加 `type="number"` + `inputMode="numeric"`，日期保留 `type="date"`。
- `FieldInput` / `FieldSelect` 加 `outlineOffset: 2` 確保鍵盤焦點環不被背景蓋住。

**暗色對比回歸（R23）：**
- 現行 dark palette：`text: #E5EAF3`（L≈0.81）on `surface: #141B2B`（L≈0.005）→ 對比約 15.6:1，遠超 WCAG AA 4.5:1。
- `FormField` label 使用 `theme.text`（非 `theme.textMuted`），確保標籤對比亦達標。
- 未修改共用調色板（在 `packages/ui-web` 外）；顏色來源均為設計系統 realm tokens，無硬編碼 hex。

**未實作（限制說明）：**
- 實際 computed style 截圖及 axe/VoiceOver/NVDA 實機測試 — 需要瀏覽器環境，無法在此 CI 步驟自動驗證。
- Modal focus trap 回傳（C120）— 無 modal 在此表單範圍，不適用。

### AC2 — 離頁返回可恢復或先確認丟棄；成功送出才清 draft

**已實作（含 Codex2 審查修復）：**
- **全欄位 Dirty 狀態追蹤（`isDriverFormDirty`, `isVehicleFormDirty`）**：
  - 司機表單追蹤所有欄位：姓名、手機、職業駕照號碼/到期日（date）、執業登記證號碼/營業區域（area）/到期日（date）、偏好車輛、服務產品清單（products）。
  - 車輛表單追蹤所有欄位：車牌號碼、牌照種類、廠牌、型號、出廠年份（year）、座位數（seats）、行李容量、營業區域（area）、服務產品清單（products）、機場接送資格/固定費率允許（flags）、當前司機、車門數、顏色（color）。
  - 支援客製 baseline 比對（供既有送件詳情編輯狀態防呆）。
- **Next.js Link 客戶端導航攔截、原生 Unload 與 Popstate 歷史保護（`useDraftGuard`）**：
  - `shouldInterceptNavigation()` 辨識跨頁連結（略過 hash、mailto、tel、javascript、target="_blank" 以及同路徑）。
  - 在 capture phase 掛載 document click listener，在 Next.js Link 事件觸發前攔截使用者點擊側邊欄（如 `/supply`）或內部連結，提示確認對話框（`confirmLeave()`）。若使用者取消則阻止導航（`preventDefault` / `stopImmediatePropagation`）。
  - `beforeunload` 事件保護頁面重整、關閉分頁或外部網址跳轉。
  - 掛載 `window:popstate` 事件攔截瀏覽器上一頁/下一頁歷程導航，提示確認對話框；取消時透過 `history.pushState` 還原目前路徑阻止導航離頁。
  - Header「返回」按鈕在 dirty 時亦呼叫 `confirmLeave()`。
  - `SupplySubmissionDetailView` 亦整合 `useDraftGuard`，在儲存中（`busy === "save"` / `upload`）維持 dirty 防護不被清空，直到 API 成功回應並更新 baseline。
- **草稿持久化、還原與安全存取（`localStorage`）**：
  - 編輯時即時將 dirty 內容寫入 `localStorage`（鍵值：`drts:fleet:supply:driver_draft`, `drts:fleet:supply:vehicle_draft`）。
  - 所有 storage 操作封裝於 `getSafeLocalStorage()` 與 try/catch，防範受限環境（如無痕/iframe/禁用 cookie）存取 `window.localStorage` 時擲出 `SecurityError` 崩潰。
  - 回到新增表單頁面時自動從 storage 還原先前填寫的內容（「離頁返回可恢復」）。
  - 還原草稿時於表單頂部顯示提示條，並提供「放棄草稿」按鈕，點擊經 `confirmDiscard` 確認後清空並重設表單（「先確認丟棄」）。
  - 成功建立送件（`onCreate()` 成功）後立即清除持久化草稿（「成功送出才清 draft」）。

### AC3 — 證據記錄

| 步驟        | 指令                                                                                                      | Exit Code |
| ----------- | --------------------------------------------------------------------------------------------------------- | --------- |
| diff-check  | `git diff --check`                                                                                        | 0         |
| lint        | `pnpm --filter @drts/fleet-partner-portal-web lint`                                                       | 0         |
| i18n-guard  | `node tools/ci/i18n-guard.mjs`                                                                            | 0         |
| typecheck   | `pnpm --filter @drts/fleet-partner-portal-web typecheck`                                                  | 0         |
| unit tests  | `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-form-001/`                                   | 0         |
| test output | `Test Files 1 passed (1) · Tests 70 passed (70)`                                                          | —         |

Base SHA：`1cdaaa5b5e5301de2da0a692c78c4cc29b0c10a9` (origin/dev, historical audit base `b32ab8badb740b94cdf67212315ecfccf21f6d5d`)

## 修改檔案

| 檔案                                                                                    | 變更                                                             |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/fleet-partner-portal-web/lib/fleet-portal-supply.ts`                              | 新增 `fieldId()`, `DRAFT_GUARD_STRINGS`, `INITIAL_*_DRAFT`, `isDriverFormDirty`, `isVehicleFormDirty`, `getSafeLocalStorage`, `save*Draft`, `load*Draft`, `clear*Draft`, `shouldInterceptNavigation`（含 SecurityError 防禦） |
| `apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx`                   | 更新 `useDraftGuard` 支援 capture click 攔截與 popstate 歷史防護；移除 detail workspace `detailDirty` 的 `!busy` 閘門維持儲存期間防護；`NewDriverSubmissionForm`/`NewVehicleSubmissionForm` 整合草稿持久化與全欄位 dirty 檢查 |
| `tests/unit/system-remediation/sr-fleet-form-001/sr-fleet-form-001.test.ts`             | 70 個 unit test（fieldId, DRAFT_GUARD_STRINGS, isEditableStatus, formatSupplySubject, 生產環境 dirty 判定測試、導航攔截測試、草稿儲存還原測試、SecurityError 防禦測試、useDraftGuard lifecycle/popstate 測試、dirty-during-save invariant 測試） |
| `docs/04-uat/system-remediation-20260906/SR-FLEET-FORM-001.md`                         | 更新驗收文件與測試證據表記錄                                     |

## 未完成 / 需要外部驗收的項目

1. **實機 AT 測試**（axe DevTools / NVDA / VoiceOver / TalkBack）— 需要真機或瀏覽器環境，不在此 CI 範圍。
2. **焦點管理 E2E**（Tab 鍵循序、Enter 提交）— 需 Playwright/Cypress，不在此 unit 範圍。
