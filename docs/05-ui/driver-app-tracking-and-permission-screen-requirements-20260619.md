# Driver App — 追蹤狀態 + 權限把關 + 服務產品脈絡（Design Hand-off）

**日期：** 2026-06-19
**Feature：** Driver App 三個介面：(A) Tracking Status 診斷、(B) Permission Gate 上線前權限把關、(C) Service Product Context（任務/行程卡顯示精確產品）
**Recipient team：** 視覺設計團隊（含 UX）
**Status：** Hand-off input. **No visual decisions in this document.**
**Author lane：** Claude
**Authority：**
[SA §6.2/§6.3/§6.5/§6.7/§6.8/§9](./../02-architecture/phase1_delta_sa_supply_eligibility_mobile_reporting_20260619.md) ·
[SD §2.9/§3.4/§6.4](./../02-architecture/phase1_delta_sd_supply_eligibility_mobile_reporting_20260619.md)
**Visual authority（既有 look／IA，請延用）：** `drts-design-canvas/driver-screens-1.jsx`、`driver-screens-2.jsx`、`driver-screens-3.jsx`、`driver-primitives.jsx`、`driver-tokens.jsx`、`Driver App.html`

> 與 `credit-card-airport-transfer-screen-requirements-20260610.md` 同型。**No visual decisions.**

---

## 1. 為什麼有這份 packet

Driver App（`apps/driver-app`，Expo/RN）已會送 heartbeat，但：沒有 **tracking-status 診斷面**、沒有正式的 **permission gate UI**、任務卡只顯示 broad label 而非精確 service product。SA §6 / SD §6.4 要求補上。本 packet 整理行為/資料/狀態/API，交付人工視覺設計（不替 RN 介面做版面決定）。

## 2. Persona & context

Persona：`driver`。
Context：

- **背景定位是上線必要條件**——只給 foreground 時 App 進背景位置會中斷，營運不可靠（SA §6.3）。
- offline queue 是 **durable**（SQLite），待送筆數要能呈現（SA §6.4）。
- **中斷要誠實揭露**——iOS force-quit 後背景定位無法持續，App 重開要偵測 tracking gap、重新同步、不得假造連續車跡（SA §6.7）。

## 3. Scope

(A) Tracking Status UI · (B) Permission Gate · (C) Service Product Context。三者皆為既有 App 的新增/修改。

## 4. Surface A — Tracking Status UI

資料（SD §6.4 + GET `/api/driver/tracking-status`，SD §3.4）：

- 定位權限狀態（foreground / background granted?）
- 背景定位狀態（運作中 / 受限）
- 上次成功上傳時間（last successful upload）
- 待送 queue 筆數（offline queue depth）
- 目前 tracking state（見 §7 狀態模型）
- 目前 vehicle / task

加上 **location freshness**（SA §6.5）：`fresh`（receivedAt ≤ 90s 且 accuracy ≤ 100m）/ `stale`（>90s）/ `low_accuracy`（accuracy >100m）/ `missing`。

行為：App 重新開啟若偵測到 **tracking gap**，須顯示 gap 通知並重新同步 active task 與 location（SA §6.7）。
狀態語意（非視覺）：「良好」= 權限齊全 + fresh + queue 低；「降級」= 權限受限 / stale / queue 累積 / 偵測到 gap。

## 5. Surface B — Permission Gate

上線前檢查序列（SD §6.4）：foreground location → background location → bound device → valid identity。

兩種拒絕狀態（SA §6.3）：

- **Foreground denied** → 不得上線；明確說明 + 前往設定；reason `LOCATION_PERMISSION_DENIED`。
- **Background denied** → 可登入並查看資料，但**不得進入 `online_available`**、**不得接受需背景追蹤的任務**；reason `BACKGROUND_LOCATION_REQUIRED`。
- 另：device 未綁定 → `DEVICE_NOT_BOUND`。

規則：background-denied 的司機可瀏覽但不可上線；gate 須提供前往系統設定的指引（deep-link）。

## 6. Surface C — Service Product Context

任務 / 行程卡須顯示 **精確 serviceProductCode**，不再只顯示 business / realtime broad label。
產品碼（SA §5.1）：`taxi_realtime`、`taxi_reservation`、`enterprise_dispatch`、`credit_card_airport_transfer`、`insurance_replacement_vehicle`、`travel_agency_transfer`、`third_party_forwarded_order`。

## 7. Driver 狀態模型（UI 須反映）

SA §6.2：`offline` / `online_available` / `assigned` / `enroute_to_pickup` / `arrived_pickup` / `on_trip` / `incident` / `paused`，各有定位節奏（如 online_available 30s/100m、on_trip 10–15s/25m、incident 5–10s）。
**Cross-surface 一致性（SA §6.8）：** App 顯示、API record、Ops Console 三者必須一致；不得出現「App 顯示 completed 但後端仍 on_trip」「App 回 available 但後端仍 assigned」等錯亂。

## 8. 錯誤 / edge（SA §9 Mobile）

`LOCATION_PERMISSION_DENIED`、`BACKGROUND_LOCATION_REQUIRED`、`HEARTBEAT_QUEUE_FULL`、`DEVICE_NOT_BOUND`、`LOCATION_STALE`。

## 9. 純視覺 open questions（交設計團隊）

- VQ-1 Tracking Status 是**獨立畫面**還是上線狀態的 status sheet？
- VQ-2 待送 queue 筆數 + 上次上傳如何呈現而不讓司機焦慮？
- VQ-3 Permission gate 是阻斷式 modal 還是 inline banner？background-denied 的「可瀏覽但不可上線」如何視覺化。
- VQ-4 freshness / gap 指示（fresh/stale/low_accuracy/missing）。
- VQ-5 任務卡上精確 product 標籤的呈現（尤其 credit_card_airport_transfer 等較長字串）。

## 10. Out of scope for design

原生權限/背景定位的實作、durable offline queue 引擎、heartbeat 批次協定、Ops 端追蹤視圖（屬 Ops packet）。
