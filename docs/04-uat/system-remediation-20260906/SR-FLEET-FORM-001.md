# SR-FLEET-FORM-001 — 供給表單可及性及未儲存草稿

| 欄位              | 內容                                                 |
| ----------------- | ---------------------------------------------------- |
| Phase             | system-remediation-20260906                          |
| Owner             | Gemini                                               |
| Reviewer          | Gemini2                                              |
| Base SHA          | `b32ab8badb740b94cdf67212315ecfccf21f6d5d` (origin/dev 2026-09-06) |
| Gap IDs           | R23, R25                                             |
| Capability IDs    | C070, C120                                           |
| Status            | candidate (handoff pending review)                   |

## 驗收條件與實作摘要

### AC1 — 鍵盤完成新增表單，欄位有 accessible name 及可讀錯誤

**已實作：**
- 新增 `FormField` 組件（`fleet-supply-workspace.tsx`），替換 `CanvasField` 用於新增/編輯表單。
  - `FormField` 輸出 `<label htmlFor={id}>` + `<input id={id}>`，建立明確 label↔input 關聯（WCAG 1.3.1, 4.1.2）。
  - 錯誤訊息在 `id="${id}-error"` + `role="alert"` 的 `<div>` 內，供 AT 即時播報。
  - 必填星號以 `aria-hidden="true"` 隱藏視覺符號，同時附加 visually-hidden 「（必填）」文字供 screen reader 讀取。
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

**已實作：**
- 新增 `useDraftGuard(dirty)` hook（`fleet-supply-workspace.tsx`）：
  - 當表單有任何必填欄位內容時，掛接 `window.addEventListener("beforeunload", ...)` 觸發瀏覽器原生離頁確認。
  - `confirmLeave()` 函式在 in-app 導航前呼叫，顯示 `window.confirm()` 對話框（含中文標題與說明）。
  - `DRAFT_GUARD_STRINGS` 常數（`fleet-portal-supply.ts`）集中管理文案，無 HTML tag（瀏覽器 dialog 只能顯示純文字）。
- `NewDriverSubmissionForm` / `NewVehicleSubmissionForm`：
  - `dirty` state 計算：任一必填識別欄位非空 → dirty=true。
  - 成功 POST 後先設 `submitted=true`（移除 beforeunload），再 `router.push()`，確保成功送出不觸發警告。
  - Header 的「返回」按鈕改為 `<button onClick={() => { if (confirmLeave()) router.back(); }}>` — 空欄時直接返回，有內容時先確認。
- `SupplySubmissionDetailView` 中的 "Save draft" 動作不受影響（已有 server-side 持久化，不需要客戶端 guard）。

**未實作（限制說明）：**
- localStorage 持久草稿恢復（"回頁還原"）— 驗收說明接受 "提供未存提醒或安全暫存，回頁還原" 中的「提醒」路徑，已由 beforeunload + confirmLeave 實現。localStorage 路徑需要更廣泛的設計決策（key 命名、清除時機、multi-tab 競態），超出此任務 write scope，已明列為未完成。

### AC3 — 證據記錄

| 步驟        | 指令                                                                                                      | Exit Code |
| ----------- | --------------------------------------------------------------------------------------------------------- | --------- |
| diff-check  | `git diff --check`                                                                                        | 0         |
| typecheck   | `pnpm --filter @drts/fleet-partner-portal-web typecheck`                                                  | 0         |
| unit tests  | `pnpm exec vitest run tests/unit/system-remediation/sr-fleet-form-001/`                                   | 0         |
| test output | `Test Files 1 passed (1) · Tests 26 passed (26)` (2026-09-06T15:48:04Z)                                 | —         |

Base SHA：`b32ab8badb740b94cdf67212315ecfccf21f6d5d`

## 修改檔案

| 檔案                                                                                    | 變更                                                             |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `apps/fleet-partner-portal-web/lib/fleet-portal-supply.ts`                              | 新增 `fieldId()` + `DRAFT_GUARD_STRINGS`                        |
| `apps/fleet-partner-portal-web/components/fleet-supply-workspace.tsx`                   | 新增 `FormField` + `useDraftGuard`；改 `DriverDraftFields` / `VehicleDraftFields` / 上傳卡 / 兩個 New*Form；加 `inputMode`/`autoComplete`/`outlineOffset` |
| `tests/unit/system-remediation/sr-fleet-form-001/sr-fleet-form-001.test.ts`             | 新增 26 個 unit test（fieldId, DRAFT_GUARD_STRINGS, isEditableStatus, formatSupplySubject, dirty invariants） |

## 未完成 / 需要外部驗收的項目

1. **實機 AT 測試**（axe DevTools / NVDA / VoiceOver / TalkBack）— 需要瀏覽器，不在此 CI 範圍。
2. **localStorage 草稿持久化**（回頁後恢復，而非確認丟棄）— 超出此任務 write scope，需 supervisor 擴 scope。
3. **焦點管理 E2E**（Tab 鍵循序、Enter 提交）— 需 Playwright/Cypress，不在此 unit 範圍。
