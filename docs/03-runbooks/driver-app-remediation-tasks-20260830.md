# Driver App 問題與修改需求清單（2026-08-30）

**專案範圍：** `apps/driver-app`（需求 2 與 5 明確要求後端配合，故涵蓋 `apps/api` 相關 driver 端點）
**Phase：** `driver-app-remediation-20260830`
**來源：** 使用者提供之 6 項問題清單，逐項已對照現行程式碼確認成立。

## 優先級摘要

| 編號 | 問題 | 優先級 | 對應任務 |
|---|---|---|---|
| 1 | 鍵盤遮擋輸入畫面 | 高 | `DRV-KBD-001` |
| 2 | 登入狀態與 Token 異常 | 最高／嚴重 | `DRV-AUTH-001`, `DRV-AUTH-002`, `BE-DRV-AUTHZ-001` |
| 3 | 顯示內部系統設計與串接文字 | 高 | `DRV-TEXT-001` |
| 4 | 文字跑版及缺少響應式設計 | 高 | `DRV-RWD-001` |
| 5 | SOS 功能設計錯誤 | 最高／嚴重 | `DRV-SOS-001` |
| 6 | 底部導覽列未全程固定 | 高 | `DRV-NAV-001` |

## 現況佐證（dispatch 前實地查核）

| 編號 | 佐證 |
|---|---|
| 1 | `apps/driver-app/app` 與 `components` 中 **完全沒有** `KeyboardAvoidingView`／`keyboardShouldPersistTaps` 使用 |
| 2 | `lib/api-client.ts:433` 只在啟動 hydration 換發 token；401/403 判定在 `:226`；無 per-request 併發 single-flight 換發 |
| 3 | `app/index.tsx` 洩漏 `Workspace sitemap`、`packet §5.3`、`Phase 1`、`CrossAppResourceLink`、`open_jobs`、`open_trip`、`open_settings`；`app/sos.tsx` 與 `lib/strings.ts` 洩漏 `passenger_conflict`；`app/safety-operator.tsx:1101` 直接以 `label="deviceId"` 顯示欄位名 |
| 4 | `app/safety-operator.tsx:1101,1165` 與 `app/settings.tsx:634,642` 顯示長識別碼；`app/index.tsx`、`app/sos.tsx`、`app/onboarding.tsx`、`app/safety-operator.tsx` 使用 `position:"absolute"` 與固定寬高 |
| 5 | `app/sos.tsx:828` 執行 `Linking.openURL('tel:...')`，即錯誤的作業系統撥號連動。平台側 API **已存在**：`apps/api/src/modules/driver-sos`（`@Controller("driver/sos-events")`、`@Controller("ops/driver-sos")`）。`app/incident.tsx` 已有正確的 2 秒長按平台通報流程（`SOS_HOLD_DURATION_MS = 2000`）與 `lib/driver-sos-outbox.ts` |
| 6 | `app/_layout.tsx:98` 使用 `Stack`，根本沒有任何 tab bar，所有頁面皆為 stack screen |

---

## 1. 鍵盤遮擋輸入畫面

### 問題描述

使用者點擊輸入欄位後，手機鍵盤會覆蓋下方表單、目前輸入欄位或後續操作按鈕。

### 修改需求

- 鍵盤出現時，畫面需自動上移或捲動至目前聚焦的欄位。
- 聚焦欄位與鍵盤之間需保留適當距離。
- 鍵盤收起後，畫面應恢復正常。
- 長表單必須可以完整捲動。
- 分別處理 iOS 與 Android 的鍵盤避讓行為。
- 同時檢查底部按鈕、Safe Area 與底部導覽列是否遭鍵盤遮擋。

### 驗收標準

所有輸入欄位在鍵盤開啟後均清楚可見，使用者可以正常輸入並操作下一個欄位或送出按鈕。

---

## 2. 全 App 登入狀態與 Token 異常

### 問題描述

目前 App 的身份驗證狀態不一致，可能發生：

- 登入後 Token 意外遺失。
- 未登入時仍能查看部分受保護資料。
- 已登入後部分資料或功能仍無法存取。
- 畫面顯示身份正常，但 API 或功能仍處於未授權、降級或不同步狀態。

### 修改需求

需全面盤點整個 `driver-app`，統一處理：

- Token 的安全儲存、讀取、更新與清除。
- App 啟動時的登入狀態恢復與初始化順序。
- Access Token 過期及 Refresh Token 自動換發。
- 多個 API 同時遇到 Token 過期時的併發換發控制。
- API 回傳 `401/403` 時的全域處理、重試及登出策略。
- 頁面路由、功能入口、資料查詢及 API 權限的一致性。
- 登出或身份失效後，清除受保護的快取與畫面資料。
- 斷網、切換網路、App 進入背景及重新開啟等情況。
- 後端必須實際驗證權限，不能只依賴前端隱藏功能。

### 驗收標準

- 未登入者無法存取任何受保護資料。
- 已登入且具備權限者可正常查看資料及使用功能。
- Token 過期時可安全換發。
- 換發失敗時，清除登入狀態並要求重新登入。
- 身份、權限、功能旗標及畫面狀態在整個 App 中保持一致。

---

## 3. 移除內部系統設計與串接文字

### 問題描述

App 多處直接顯示開發、規格或系統內部資訊，例如：

- `Workspace sitemap`
- `packet §5.3`
- `Phase 1`
- `CrossAppResourceLink`
- `open_jobs`
- `open_trip`
- `open_settings`
- API、資料欄位、路由名稱及功能旗標
- 跨系統串接策略或 Web Console 說明

這些內容對一般使用者沒有幫助，也可能暴露不必要的系統架構資訊。

### 修改需求

- 全面掃描所有頁面、卡片、彈窗、提示及錯誤訊息。
- 刪除純開發、規格註記及除錯用途的文字。
- 必須保留的資訊需改寫為簡短、清楚的使用者語句。
- 不得顯示程式識別名稱、API 欄位、功能旗標或規格編號。
- 正式版本不得因設定錯誤而顯示開發文字。
- 同步檢查正常、載入、空資料、錯誤、離線及權限不足狀態。

### 驗收標準

使用者只能看到與操作及決策直接相關的文字，不會看到任何內部系統設計或開發術語。

---

## 4. 修正文字跑版並導入響應式設計

### 問題描述

部分長文字及識別碼會發生：

- 超出卡片或螢幕範圍。
- 與其他內容重疊。
- 不合理斷行或遭到裁切。
- 按鈕、標籤及欄位被擠壓變形。

例如 `DeviceId`、`BindingId` 等長字串已出現明顯溢位。

### 修改需求

- 移除不必要的固定寬度、固定高度及絕對定位。
- 使用可伸縮及可換行的版面配置。
- 長識別碼應合理換行、截斷或提供複製功能。
- 標題、狀態標籤、按鈕及欄位不得超出容器。
- 支援 iOS 動態文字及 Android 字體、顯示縮放設定。
- 檢查瀏海、動態島、圓角、狀態列及 Safe Area。
- 測試鍵盤、載入、錯誤、空資料及極端長文字狀態。

### 代表性測試機型

| 系統 | 機型 | 螢幕尺寸 | 原生解析度 |
|---|---|---:|---:|
| iOS | iPhone SE（第 3 代） | 4.7 吋 | 750 × 1334 |
| iOS | iPhone 16 | 6.1 吋 | 1179 × 2556 |
| iOS | iPhone 17 | 6.3 吋 | 1206 × 2622 |
| iOS | iPhone 16 Plus | 6.7 吋 | 1290 × 2796 |
| iOS | iPhone 17 Pro Max | 6.9 吋 | 1320 × 2868 |
| Android | Samsung Galaxy S26 | 6.3 吋 | 1080 × 2340 |
| Android | Samsung Galaxy S26+ | 6.7 吋 | 1440 × 3120 |
| Android | Google Pixel 10 | 6.3 吋 | 1080 × 2424 |
| Android | Google Pixel 10 Pro XL | 6.8 吋 | 1344 × 2992 |

實際排版測試還需涵蓋約 `320、360、375、393、402、412、430、440 dp/pt` 的有效畫面寬度，以及 100%、125%、150% 和最大輔助字級。

### 驗收標準

所有主要頁面均需在小、中、大螢幕的 iOS 與 Android 裝置上逐一測試，不得出現溢位、重疊、裁切或無法操作的情況。

---

## 5. 重新設計 SOS 安全求援功能

### 問題描述

目前 SOS 錯誤地連動 iOS／Android 作業系統的緊急求救功能。實際需求是將安全事件通報至本專案的平台，而不是啟動手機系統 SOS。

### 正確操作流程

1. 使用者開啟「安全求援」頁面。
2. 選擇求救類型。
3. 視需要輸入補充說明。
4. 長按約 2 秒確認送出，避免誤觸。
5. App 將事件及相關資料送至專案平台。
6. 顯示傳送中、成功、失敗及平台已接收等狀態。

### 求救類型

- 乘客衝突
- 交通事故
- 車輛故障
- 醫療緊急
- 路線威脅
- 其他

### 通報資料

- 求救類型及補充說明
- 駕駛、車輛與裝置識別
- 目前訂單及行程資訊
- 發送時間
- 即時位置
- 網路與通報狀態
- 唯一事件識別碼

### 修改需求

- 移除現有作業系統 SOS 的錯誤聯動。
- 串接專案平台的 SOS API、即時通知或事件通道。
- 防止誤觸與重複送出。
- 弱網或斷網時不得錯誤顯示成功。
- 若支援離線排隊重送，必須清楚呈現目前狀態。
- Token 失效時需有明確且安全的處理，不得無聲失敗。
- 後台需通知安全或調度人員，形成完整處理閉環。
- 不得顯示 `incident_category`、`passenger_conflict`、`press_and_hold_2s` 等內部欄位名稱。

### 驗收標準

不能只確認 App 顯示「送出成功」，必須驗證專案平台確實收到正確的事件、駕駛、行程、時間及位置資料。

---

## 6. 底部導覽列需在所有介面固定顯示

### 問題描述

目前進入部分頁面或子頁面後，底部導覽列會消失，導致使用者無法快速切換主要功能。

### 導覽項目

- 工作台
- 任務
- 行程
- 平台
- 設定

### 修改需求

- 將底部導覽列放在共用的根導覽架構。
- 所有主要頁面及其子頁面都應沿用同一導覽列。
- 導覽列固定於螢幕底部，不隨內容捲動。
- 正確標示目前所在分頁。
- 切換分頁後保留各分頁原本的瀏覽狀態。
- 頁面內容需預留底部空間，不得遭導覽列遮擋。
- 適配 iOS Home Indicator、Android 系統導覽區及 Safe Area。
- 檢查鍵盤、彈窗、載入及錯誤狀態下的顯示。
- 除非產品規格明確定義例外，不能因頁面或導覽層級不同而意外消失。

### 驗收標準

從五個主要分頁逐一進入所有子頁面，並測試返回及跨分頁切換；底部導覽列皆須固定顯示、可正常操作且狀態正確。

---

## 檔案所有權（避免同批任務互相衝突）

`DRV-NAV-001` 會將 route 檔案搬入 tabs 群組，屬結構性變更，因此是所有畫面任務的前置。之後：

- `DRV-SOS-001` **獨佔** `app/sos.tsx`、`app/incident.tsx`、`lib/driver-sos-outbox.ts`，並自行負責該頁的鍵盤與版面。
- `DRV-KBD-001` 處理 `app/sos.tsx`、`app/incident.tsx` **以外** 的所有輸入畫面。
- `DRV-TEXT-001` 只改使用者可見字串，不改版面結構。
- `DRV-RWD-001` 最後執行，在最終程式碼上做版面與裝置矩陣驗證。

---

## 已知的 CI 假紅燈（不要為此修改程式碼）

`github_bus` 開 PR 的流程是「建立 draft PR → 立刻轉 ready」，兩個動作各觸發一次 CI。
`.github/workflows/ci.yml:26` 設定 `cancel-in-progress: true`，所以第一個 run 會被第二個取消。
但聚合閘門 `.github/workflows/ci.yml:254` 是 `if: always()`，在 run 被取消的當下照樣執行，
而 `:264` 把 `cancelled` 與 `failure` 一視同仁：

```bash
[ "$SCOPE_RESULT" = "success" ] || { echo "Change scope classification failed"; exit 1; }
```

結果是**每個任務的第一次 PR 都會留下一個假的 `Smoke acceptance` 紅叉**。

實例：DRV-AUTH-001 的 PR #1586，run `33300429778` 顯示
`SCOPE_RESULT: cancelled` / `Change scope classification failed`，
而真正在跑的 run `33300431959` 全數通過，PR 也正常 merge 進 dev。

**判別方式：** 若失敗訊息含 `cancelled`，先用
`gh run view <run-id> --json conclusion` 確認該 run 的 conclusion 是否為 `cancelled`。
是的話這不是你的程式碼問題 —— 看同一個 PR 上較新的那個 run，不要為此修改任何實作或測試。

此 CI 缺陷已回報，本階段暫不修正（決議：只通知執行者，CI 之後再處理）。

---

## 需求 4 範圍調整（2026-08-30，經使用者確認）

原驗收要求在 iPhone SE／16／17／16 Plus／17 Pro Max 與 Galaxy S26／S26+／Pixel 10／Pixel 10 Pro XL
上逐一留下視覺證據。**此環境無 iOS 或 Android 模擬器**，且 `apps/driver-app` 的 vitest
設定為 `environment: "node"`，不做 DOM 渲染 —— 產不出真機證據。

因此 `DRV-RWD-001` 改為 **程式碼層級驗收**：

- 移除不必要的固定寬高與絕對定位，改用可伸縮換行版面
- 長識別碼（`DeviceId`、`BindingId`）換行或截斷，且完整值仍可取得
- 使用可縮放字級單位，支援 iOS Dynamic Type 與 Android 字體縮放
- 以 safe-area inset 取代硬編碼 padding
- 加入掃描測試，新出現的固定寬高／絕對定位會使測試失敗

**明確排除：** 裝置矩陣視覺驗證。
**嚴禁：** 為跑不到的裝置捏造截圖或 UAT 證據。任務結果必須明說哪些檢查僅止於程式碼層級。

實機驗收由使用者自行在真機抽查。

## 已知缺陷：驗收條目被逗號切碎

`ai-status.sh assign` 的 `TASK_ACCEPTANCE` 以逗號分隔。
本階段最初 8 個任務的驗收條目凡含逗號者皆被切成無意義片段
（例如 `No unnecessary fixed width` / `fixed height or absolute positioning remains...` 被拆成兩條）。

完整需求靠 `TASK_SUMMARY_ZH` 傳遞（該欄位不做切割），所以實際產出未受重大影響。
**後續撰寫 dispatch script 時，驗收條目內不得使用逗號**，改用分號、冒號或 `and`。
