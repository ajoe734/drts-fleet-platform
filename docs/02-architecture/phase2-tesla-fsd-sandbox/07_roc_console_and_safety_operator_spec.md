# ROC Console 與 Safety Operator App 產品規格


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## A. ROC Console

### A1. Navigation

```text
Overview
Live Board
Trips
Vehicles
Takeovers
Alerts
Incidents
Evidence
Provider Health
Regulatory Reports
Shift Handover
```

### A2. Live Board

顯示：

- local approval area and route overlay
- vehicle location / last update
- trip phase
- Tesla telemetry status
- regulatory event feed status
- safety operator
- SOC / estimated range
- operational hold
- active alerts

不顯示：方向盤角度、FSD perception objects、路側設備 health。

### A3. Vehicle Detail

- binding and capability profile
- firmware / telemetry client version
- experiment enrollment
- current trip and operator
- telemetry freshness
- provider event sequence status
- evidence recorder health
- holds and incidents
- recent provider events and local reports

### A4. Takeover Queue

三欄：

1. Tesla provider events
2. Safety operator reports
3. ROC actions

支援：correlate、open discrepancy、open incident、freeze evidence、request operator report。

### A5. Alert Actions

```text
acknowledge
assign
stop new dispatch
place operational hold
request safety operator action
open incident
start evidence freeze
invoke human taxi fallback
notify authority / supervisor
resolve with reason
```

全部使用 backend `availableActions`，UI 不自行推斷權限。

### A6. Shift Handover

- active trips
- unresolved alerts
- provider gaps
- vehicles on hold
- pending notifications
- evidence freeze in progress
- report deadlines

## B. Safety Operator Mode

### B1. Identity and Qualification

- dedicated mobile realm / scopes
- active qualification
- assigned experiment and vehicle
- shift and fatigue policy acknowledgement

### B2. Pre-trip Checklist

- vehicle identification
- evidence recorder health
- Tesla integration state
- emergency contact
- approved route / time
- passenger / booking reference
- required equipment
- operator confirmation and signature

### B3. Active Trip

顯示：

- booking and destination
- experiment status
- local approved route status
- ROC contact
- Tesla provider connectivity state
- takeover report button
- incident / SOS

不顯示或嘗試控制 Tesla FSD internal controls。

### B4. Takeover Report

快速 capture：

- occurred time (editable with audit)
- trigger source
- reason
- disposition
- description / voice note
- photo / video upload
- local recorder bookmark
- whether FSD resumed
- whether human completed trip

### B5. Offline Mode

- local encrypted queue
- immutable local event ID
- sync retry
- server receipt
- duplicate detection
- visible unsynced status

### B6. End-of-trip

- trip outcome
- FSD / human segments based on provider summary
- takeover confirmation
- unresolved discrepancy
- incident / proof completion
- handover to next operator
