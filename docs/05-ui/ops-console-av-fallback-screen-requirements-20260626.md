# Ops Console — AV fallback / passenger recovery / sandbox exceptions (Design Hand-off)

**日期：** 2026-06-26  
**Task：** `P2-UI-OPS-001`  
**Feature：** Ops Console 增量介面：`OC_AvFallback`、`OC_PassengerRecovery`、`OC_SandboxExceptions`  
**Recipient team：** 視覺設計團隊（含 UX）  
**Status：** Hand-off input only. **No visual decisions in this document.**  
**Author lane：** Codex  
**Authority：**
`P2-UI-OPS-001` task brief ·
[`docs/04-uat/phase2-av-fallback-to-human-uat-20260626.md`](./../04-uat/phase2-av-fallback-to-human-uat-20260626.md) ·
[`packages/contracts/src/phase2-tesla-fsd-sandbox.ts`](../../packages/contracts/src/phase2-tesla-fsd-sandbox.ts) (`SandboxFulfillmentVisibilityRecord`, `SandboxFulfillmentProjectionView`, `RocFallbackToHumanReport`) ·
[`apps/api/tests/integration/int-p2-002-sandbox-dispatch-hook.test.ts`](../../apps/api/tests/integration/int-p2-002-sandbox-dispatch-hook.test.ts) ·
[`apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts`](../../apps/api/tests/integration/int-p2-008-roc-human-fallback.test.ts)

**Visual authority（既有殼／IA，僅可延用，不足以自行發明新 screen）：**
`docs/05-ui/drts-design-canvas/ops-screens-1.jsx`、`Ops Console.html` 現有 `/dispatch/[id]` shell。

> **Canonical gap:** task brief 指定的 `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`
> 不存在於目前 repo/worktree；既有 Ops Console canvas 也沒有
> `OC_AvFallback`、`OC_PassengerRecovery`、`OC_SandboxExceptions` 這三個 artboard。
> 依 UI design contract，本文件只能作為非視覺 hand-off，**實作必須等待 canonical canvas 補齊**。

---

## 1. 為什麼有這份 packet

Phase 2 backend 已落地 AV fallback-to-human 的資料語義：同一 `bookingId` / `orderId`
鏈路、更新後的 `etaSnapshot`、ROC fallback report、以及乘客安全文案的 `messageCode` 投影。

但 Ops Console 的 canonical canvas 尚未提供對應 screen。此 packet 的目的不是重畫版面，
而是把設計團隊必須知道的資料、不變條件、狀態與禁止洩漏項先講清楚，讓後續 canvas 能正確接軌。

## 2. Personas

- `ops_dispatcher`：確認 AV trip 已改派為 human、檢查 ETA 是否已修正、追蹤同一 booking 的派遣鏈。
- `ops_supervisor`：核對 ROC intervention / fallback report / exception artifact，確認 audit 與 billing 鏈未斷。
- `ops_callcenter`：查看**乘客實際會收到的文案**與最新 ETA，避免對外口徑錯誤或洩漏內部原因。

## 3. Scope

| Surface | 狀態 |
| --- | --- |
| `OC_AvFallback` — 同 booking 的 fallback 工作區 | 本 packet |
| `OC_PassengerRecovery` — 乘客口徑 + ETA 預覽 | 本 packet |
| `OC_SandboxExceptions` — sandbox exception / report 列表 | 本 packet |

Out of scope：ROC 調度操作本身、sandbox gate 決策邏輯、billing engine、driver app、passenger 端實際畫面。

## 4. Shared invariants（所有三個 surface 都必須遵守）

1. **同一 booking / order context 不可斷鏈。**  
   UI 必須明確維持同一 `bookingId`、同一 `orderId`、同一 `dispatchJobId` 的上下文；
   不得把 fallback 描述成新 booking、替代 booking、或新 trip。

2. **ETA 必須採 revised ETA / `etaSnapshot`。**  
   Fallback 完成後的 passenger ETA 以後端更新後的 `etaSnapshot` / `revisedEtaMinutes`
   為準，不可沿用 AV assignment 舊 ETA。

3. **Passenger 文案只吃 backend `messageCode`。**  
   前端只做 i18n / label mapping，不可自行拼湊或翻譯內部 reason。  
   禁止顯示給乘客口徑的內容包括：
   - `reason`
   - `hardReasonCodes`
   - `softReasonCodes`
   - raw sandbox gate decision / internal takeover note
   - Tesla / FSD provider internal reason / fault code
   - ROC operator 的 free-form 說明

4. **不顯示 surcharge。**  
   AV fallback 不得額外向乘客呈現 surcharge / extra-charge 提示；若畫面有收費區塊，
   fallback 狀態下必須明確維持 `extraChargeDisclosed = false` 的語義。

5. **沿用既有 Ops dispatch detail shell。**  
   這三個 surface 是既有 `/dispatch/[dispatchId]` / 同 work-item context 的增量，
   不是新增全局導航或另起一個新 console 模組。

6. **Ops-only 與 passenger-safe 資訊必須分層。**  
   同一畫面可以同時容納 ops 內部資訊與乘客口徑預覽，但兩者不可混成單一文案區塊。

## 5. Surface A — `OC_AvFallback`

### 5.1 目的

讓 ops 在**同一 dispatch detail context** 內看到：原 AV assignment 如何被 human fallback 取代，
以及這個替換是否仍維持原 booking / dispatch chain。

### 5.2 必備資料

來自 `RocFallbackToHumanReport`、fallback response、現有 order/dispatch/task context：

- `bookingId`
- `orderId`
- `dispatchJobId`
- `trigger`
- `sandboxDecisionId`
- `previousAssignmentId`
- `fallbackAssignmentId`
- `fallbackTaskId`
- `avVehicleId`
- `avDriverId`
- `humanVehicleId`
- `humanDriverId`
- `revisedEtaMinutes`
- `reportArtifactId`
- `generatedAt`
- order `status`
- order `etaSnapshot`

### 5.3 UI 必須表達的語義

- 這是**同一筆 booking** 的改派，不是補單。
- 若原先有 AV assignment，UI 必須能看出「前 assignment → fallback assignment」的交接鏈。
- human assignment / task 已在原 dispatch chain 上建立。
- ETA 已被修正，且現在對外有效的 ETA 是 fallback 後版本。
- 這次 fallback 對應一份 sandbox exception report / artifact，可被 ops 查核。

### 5.4 狀態 / edge

- gate-triggered fallback：`fallbackRequired = true` 後改派。
- ROC manual intervention：已有 AV assignment，但 ROC 主動改派。
- order 已 `completed` / `cancelled`：仍需保留 fallback 發生過的 audit 事實。
- order 沒有 `bookingId`：不屬於本 task 的主要 happy path，設計需給 secondary empty/error state。

## 6. Surface B — `OC_PassengerRecovery`

### 6.1 目的

讓 ops 在內部頁面中看到**乘客將收到的安全文案**與最新 ETA，作為 callcenter / incident / recovery 對外口徑依據。

### 6.2 資料 authority

以 `SandboxFulfillmentProjectionView` / `SandboxFulfillmentVisibilityRecord` 的 passenger-safe
語義為準，尤其是：

- `messages[].messageCode`
- `messages[].category`
- `fulfillmentMode`
- `state`
- `statusCode`
- `etaMinutes`
- `extraChargeDisclosed`
- `updatedAt`

### 6.3 UI 必須表達的語義

- 乘客可見文案不是 ops 自由輸入，而是 backend 決定的 `messageCode`。
- fallback 情境下，主要 passenger 文案應對應
  `sandbox_fulfillment.service_continues_with_human_driver`
  或其他 backend projection 回傳的安全 code。
- passenger panel 應清楚反映最新 ETA。
- passenger panel 不得因 fallback 額外出現 surcharge 提示。

### 6.4 禁止洩漏項

在這個 panel 中，不可顯示：

- `hardReasonCodes` / `softReasonCodes`
- internal takeover / ROC intervention details
- AV provider internal error / safety reason
- sandbox gate 的原始 block reason
- ops free-form notes

### 6.5 狀態 / edge

- `human_fallback`
- `mixed`
- `pending_dispatch`
- `completed`
- `cancelled`

不同狀態的乘客文案由 backend `messageCode` 決定，前端不得自行用 `reasonCode` 分流。

## 7. Surface C — `OC_SandboxExceptions`

### 7.1 目的

提供 ops 一個可追蹤的 sandbox exception / report 列表，讓同 booking 的 fallback 不是只留在 timeline，
而是可作為後續 audit / compliance / recovery 對帳的明確項目。

### 7.2 列表至少要能承載的欄位

來自 `RocFallbackToHumanReport`：

- `reportId`
- `generatedAt`
- `bookingId`
- `orderId`
- `dispatchJobId`
- `trigger`
- `sandboxDecisionId`
- `sandboxProgramId`
- `previousAssignmentId`
- `fallbackAssignmentId`
- `fallbackTaskId`
- `avVehicleId`
- `avDriverId`
- `humanVehicleId`
- `humanDriverId`
- `revisedEtaMinutes`
- `hardReasonCodes`
- `softReasonCodes`
- `reportArtifactId`

### 7.3 列表語義要求

- 同 booking 的當前 exception 應可被清楚辨識，不可與其他 sandbox report 混淆。
- 這份列表是 ops-only surface，可以顯示 reason code 與 artifact ref，
  但不能回寫到 passenger-safe panel。
- 設計需保留「從列表回到原 dispatch detail / 原 booking context」的路徑。

### 7.4 目前已知資料缺口

Repo 內 `RocOperationsService.listFallbackReports()` 已存在，但目前沒有對外 controller route；
若設計要做真正的列表頁/區塊，實作端需要可讀 endpoint 才能完成。

## 8. 錯誤 / edge

- `ops-av-fallback.jsx` 缺失：本 task 的主要 blocker；沒有 canonical visual screen 時不得自行出圖。
- fallback response 成功，但 exception report 列表來源未暴露：UI 只能暫留 data dependency，不可自造假資料。
- booking-backed trip 與 non-booking trip 必須區分；本 task acceptance 以 same-booking flow 為主。
- passenger projection 與 ops timeline 的資料更新時間可能不同；需要明確呈現 freshness / updatedAt。

## 9. 純視覺 open questions（交設計團隊）

- VQ-1 `OC_AvFallback`、`OC_PassengerRecovery`、`OC_SandboxExceptions` 在既有 `/dispatch/[id]`
  shell 中是分頁、上下堆疊、還是主副欄配置？
- VQ-2 如何在不重複現有 header 的前提下，讓使用者一眼知道「同一 booking、同一 order、assignment 已改派」？
- VQ-3 passenger-safe 文案預覽與 ops-only exception/report 區塊如何做視覺隔離，避免誤讀？
- VQ-4 sandbox exception 列表是一個 current-booking 區塊，還是可被複用為全域 queue？
- VQ-5 revised ETA、old/new assignment refs、report artifact ref 的密度如何安排才不壓垮 dispatch detail？

## 10. Required follow-up before UI implementation

1. 視覺設計團隊補 canonical canvas：
   `docs/05-ui/drts-design-canvas/ops-av-fallback.jsx`
   或等價、被明確指定為 visual authority 的 artboard 檔案。
2. 若 `OC_SandboxExceptions` 要顯示真實列表，backend 需提供 ops-readable report list endpoint。
3. 若 ops 需要直接預覽 passenger-safe 文案，資料面必須提供可由 ops 安全讀取的 projection，
   但仍維持 `messageCode only` / no internal reason leak 的 contract。

在上述 follow-up 補齊前，`apps/ops-console-web` 不應自行發明此三個 screen 的版面或互動。
