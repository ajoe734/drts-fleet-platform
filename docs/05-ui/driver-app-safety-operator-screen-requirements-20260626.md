# Driver App — Safety Operator Mode（Design Hand-off）

**日期：** 2026-06-26  
**Feature：** Driver App Safety Operator realm：`SOFrame` / `SOModeBar` / `SOSyncStrip` + `SO_Provisioning` / `SO_Pretrip` / `SO_ActiveTrip`（含 takeover report）/ `SO_IncidentUpload` / `SO_ShiftHandover`  
**Recipient team：** 視覺設計團隊（含 UX）  
**Status：** Blocked by missing canvas. Hand-off input only. **No visual decisions in this document.**  
**Author lane：** Codex  
**Authority：**
[`phase1_prd_detailed_v1.md` §15.3 / §16.2](../../phase1_prd_detailed_v1.md) ·
[`phase1_system_analysis_v1.md` §3.2](../../phase1_system_analysis_v1.md) ·
[`packages/contracts/src/phase2-tesla-fsd-sandbox.ts` §3.5](../../packages/contracts/src/phase2-tesla-fsd-sandbox.ts) ·
[`apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts`](../../apps/api/tests/integration/int-safe-001-takeover-offline-replay.test.ts)
**Visual authority（既有 look／IA，僅可延用，不足以完成本 feature）：** `docs/05-ui/driver-app-design-20260507/driver-screens-1.jsx`、`driver-screens-2.jsx`、`driver-screens-3.jsx`、`design-canvas.jsx`、`components.jsx`、`tokens.jsx`、`DRTS Driver App.html`

> Repo 內目前**沒有** `driver-safety-operator.jsx` 或等價 safety-operator canvas。依 task brief 的 UI design contract，缺 screen 真源時只能交 screen-requirements note，不能自行設計畫面。

---

## 1. 為什麼有這份 packet

`P2-UI-SAFE-001` 要求在 `apps/driver-app` 內新增 Safety Operator realm，且必須與一般司機 mode 分離；另外要滿足：

- offline queue + unsynced indicator
- takeover report 以 client-generated id 去重
- takeover 時間可編輯，但必須保留 audit
- 不顯示、也不控制 Tesla / FSD internal controls
- 文案需支援 i18n

目前 repo 的 Driver App canvas 只涵蓋一般司機工作台與 `SOS` incident screen，沒有 `SOFrame`、`SOModeBar`、`SOSyncStrip` 或任何 safety-operator-specific screens。因此這份文件只整理需求、資料、狀態與缺口，交由人工視覺設計補齊正式 canvas。

## 2. Persona & context

Persona：`safety_operator`。  
Context：Tesla / AV sandbox overlay（Phase 2），不是既有 `driver` persona 的視覺變體。

非視覺硬規則：

- Safety Operator realm 必須是**獨立 mode / realm**，不可和一般 `driver` 畫面共用同一套導覽語意後只換字。
- App 只能呈現 safety-operator 任務上下文、回報、handover、incident/evidence 狀態；**不可**出現任何 Tesla/FSD 遙控、接管、啟閉或 vehicle command controls。
- 所有可離線提交的安全員動作，需有 durable local queue 與明確的未同步狀態揭露。

## 3. Scope

本 feature 的 screen / shell scope：

- `SOFrame`
- `SOModeBar`
- `SOSyncStrip`
- `SO_Provisioning`
- `SO_Pretrip`
- `SO_ActiveTrip`
- `SO_IncidentUpload`
- `SO_ShiftHandover`

## 4. Shared behavioral requirements

### 4.1 Realm 分離

- Safety Operator mode 與一般 driver mode 的 entry、header copy、navigation context、state persistence 必須分離。
- 若裝置同時具備一般司機與安全員權限，切換 mode 時不可混用 pending queue / current shift / current assignment。

### 4.2 Offline queue / unsynced 揭露

- Safety Operator 寫入行為至少包含：pre-trip checklist、takeover report、incident/evidence upload metadata、shift handover / trip closeout。
- queue 必須是 durable（不可只存在記憶體），並在 UI 上持續揭露「待同步 / 同步中 / 同步失敗 / 已同步」。
- `SOSyncStrip` 應承載 queue 深度、最後成功同步時間、失敗重試狀態；此文件不定義其版面，只定義它必須存在。

### 4.3 client-generated id 去重

- takeover report 必須使用 `clientGeneratedReportId` 去重；重送不得覆寫第一次成功寫入的 payload。
- UI 必須能識別「本地待送但 server 已收」與「本地重試仍未收」的不同狀態，避免重複顯示為多筆 report。

### 4.4 takeover 時間可編輯，但需保留 audit

- `occurredAt` 不能是不可變唯讀欄位；需要允許 safety operator 修正接管發生時間。
- 但修正後不能只留下最終值。UI / data model 需保留：
  - 原始建議時間（device-captured / auto-filled）
  - 操作者編輯後時間
  - 編輯原因或 audit marker
- 目前 contract 只有 `occurredAt` 與 `serverReceivedAt`；正式 canvas 與 runtime 實作需一起處理 audit 呈現與欄位承載。

### 4.5 No FSD control UI

- 不可顯示任何 vehicle remote command、FSD enable/disable、resume/autopilot toggles、door/lock/honk/light 類控制。
- `fsdResumed` 若需呈現，只能作為事件結果/回報欄位，不得被設計成 vehicle-control affordance。

## 5. Surface requirements

## 5.1 `SO_Provisioning`

用途：確認 safety operator 身分、資格、assignment、device / vehicle 綁定與 sandbox context。

需承載的資料／狀態：

- `safetyOperatorId`
- `sandboxProgramId`
- `deviceId`
- `vehicleId`
- `assignmentId`
- `qualified`
- `matchedQualificationIds`
- `reasons`
- `activeAssignmentId`

行為：

- 若資格不足、device 不符、assignment 不屬於本人，必須阻止進入 active-trip flow。
- 本 screen 是安全員 mode 的入口，不是一般 driver onboarding 的重皮。

## 5.2 `SO_Pretrip`

用途：提交安全員出車前檢查。

contract checklist items：

- `vehicle_exterior`
- `cab_cleanliness`
- `seatbelts`
- `brakes`
- `lights`
- `tires`
- `mirrors`
- `recorder_health`
- `autonomy_stack`
- `fallback_comms`

每項皆需支援：

- `pass` / `fail` / `na`
- optional note

另需承載：

- `blockerCodes`
- `notes`
- `allPassed`
- `completedAt`

## 5.3 `SO_ActiveTrip`

用途：安全員進行中班次 / trip 的主工作台。

至少需顯示的上下文：

- 目前 `shiftId`
- 目前 `assignmentId`
- `vehicleId`
- `orderId`
- queue / unsynced 狀態（透過 `SOSyncStrip`）
- 最近一次同步結果
- 尚未同步的 checklist / takeover / incident / closeout 項目數

此 screen 內需容納 takeover report flow。

### Takeover report requirements

需承載欄位：

- `clientGeneratedReportId`
- `correlationId`
- `safetyOperatorId`
- `vehicleId`
- `orderId`
- `sandboxProgramId`
- `shiftId`
- `assignmentId`
- `trigger`
- `reasonCode`
- `disposition`
- `fsdResumed`
- `bookmarkId`
- `incidentId`
- `evidenceArtifactIds`
- `notes`
- `occurredAt`

行為：

- 送出成功後需能顯示 server receipt（`reportId` / `serverReceivedAt` / duplicate state）。
- 離線時可先進 queue；重送成功後，原本本地 pending item 必須與 server receipt 合併，而不是額外長出第二筆。
- 若使用者編輯 `occurredAt`，畫面需揭露 audit marker；此文件不定義視覺樣式。

## 5.4 `SO_IncidentUpload`

用途：綁定 incident / evidence metadata。

至少需支援：

- `incidentId`
- `bookmarkId`
- `evidenceArtifactIds`
- 與當前 takeover / closeout 的關聯狀態
- 離線待送與同步失敗狀態

此 screen 只處理回報與證據關聯，不處理 Tesla/FSD 控制。

## 5.5 `SO_ShiftHandover`

用途：結束 shift、handoff trip、或建立 trip closeout。

需支援的 closeout 狀態：

- `completed`
- `handoff`
- `incident_escalated`
- `cancelled`

需承載：

- `closeoutAt`
- `takeoverReportIds`
- `incidentId`
- `evidenceArtifactIds`
- `notes`
- `endedAt`
- `endLocation`

此 surface 需清楚區分：

- 結束單筆 trip closeout
- 結束整個 operator shift
- handoff 給下一位 operator / ROC 的情境

## 6. Runtime gaps discovered in repo

以下缺口會阻止直接實作 `apps/driver-app` UI：

1. 缺少 safety-operator canvas
   目前 repo 內找不到 `driver-safety-operator.jsx`、`SOFrame`、`SOModeBar`、`SOSyncStrip` 或等價 screen spec。

2. driver-app 尚無 safety-operator API client surface
   `packages/api-client/src` 與 `apps/driver-app/lib/api-client.ts` 尚未露出 `/api/safety-operator/*` 相關 client helper；目前 driver-app route 也沒有 safety-operator screens。

3. editable-with-audit takeover time 尚無一等欄位承載
   現有 contract / service 會儲存 `occurredAt` 與 `serverReceivedAt`，且以 `clientGeneratedReportId` 去重；但沒有獨立的「原始時間 / 編輯後時間 / 編輯原因」欄位結構。

## 7. 純視覺 open questions（交設計團隊）

- VQ-1 `SOFrame` 是否與一般 Driver App phone shell 完全共框，還是安全員 realm 需要獨立 header / nav chrome？
- VQ-2 `SOModeBar` 如何明確表達「安全員 mode」而不與一般 driver mode 混淆？
- VQ-3 `SOSyncStrip` 如何揭露 queue 深度、同步失敗與 duplicate receipt，而不造成操作員誤判是否已正式報送？
- VQ-4 takeover report 的 `occurredAt` 編輯 audit，畫面應如何同時呈現原始值與修正值？
- VQ-5 `SO_ShiftHandover` 如何視覺化 trip closeout、shift end、handoff 三種不同 closeout intent？

## 8. Out of scope for this note

- RN / Expo runtime 實作
- SQLite / SecureStore / queue engine 細節
- `/api/safety-operator/*` client helper 寫法
- Tesla / FSD / vehicle command UI
- 視覺 layout、色彩、icon、字級、spacing 決策
