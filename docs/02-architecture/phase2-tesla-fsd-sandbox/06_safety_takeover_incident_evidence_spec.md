# 安全監控、接管、事故與證據保全規格


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. 接管紀錄架構

接管不是單一 Boolean，而是三個 authority record：

### 1.1 TeslaAutonomyTransitionEvent

Tesla 原廠提供 FSD 狀態轉換與原因碼。

### 1.2 SafetyOperatorTakeoverReport

```ts
interface SafetyOperatorTakeoverReport {
  reportId: string;
  takeoverCorrelationId: string;
  tripId: string;
  vehicleId: string;
  vin: string;
  safetyOperatorId: string;
  occurredAt: string;
  reportedAt: string;
  location: GeoPoint | null;
  triggerSource: "operator_initiated" | "vehicle_prompt" | "roc_request" | "passenger_emergency" | "unknown";
  reasonCode: string;
  description: string | null;
  postTakeoverDisposition: "fsd_resumed" | "human_completed" | "vehicle_stopped" | "incident_escalated";
  fsdResumedAt: string | null;
  incidentId: string | null;
  localVideoBookmarkIds: string[];
  evidenceManifestId: string | null;
}
```

### 1.3 RocTakeoverResponseRecord

- alert received / acknowledged
- operator / supervisor
- action timestamps
- vehicle hold
- passenger / ops notification
- fallback decision
- incident and regulatory notification references

## 2. Correlation

Correlation priority：

1. provider session / event ID + VIN + trip time window
2. VIN + event time + local trip
3. manual review if ambiguous

不一致建立 `EvidenceDiscrepancyCase`。

## 3. 車載證據錄影

### 3.1 原則

- 不依賴路側設施
- 不參與 FSD 控制
- 為營運方可控的獨立證據來源
- Tesla 若提供合法影像，作額外來源，不取代本地 evidence policy

### 3.2 建議來源

- front roadway
- rear roadway
- optional side / 360 camera
- safety operator area
- passenger cabin only when approval/privacy policy requires

### 3.3 Recorder Health

- device ID / vehicle binding
- clock sync status
- storage health
- camera status
- last segment time
- encryption state
- upload queue
- firmware

必要 recorder unhealthy => no-new-dispatch。

## 4. Evidence Freeze

### 4.1 Trigger

- accident / collision
- SOS
- major takeover
- vehicle emergency / safe stop report
- route/time violation with safety significance
- ROC manual freeze
- authority request

### 4.2 Window

Policy-driven，例如：

- video: pre-event N minutes, post-event M minutes
- telemetry: pre/post window
- Tesla events: session and adjacent events
- local app logs / ROC actions

不硬編 DRTS 的固定秒數；可用其前後影像保全概念作參考。

## 5. EvidenceManifest

```ts
interface EvidenceManifestItem {
  evidenceId: string;
  sourceType: string;
  sourceSystem: string;
  deviceId: string | null;
  vin: string | null;
  capturedFrom: string | null;
  capturedTo: string | null;
  originalFileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string;
  providerSignature: string | null;
  storageUri: string;
  objectGeneration: string | null;
  legalHold: boolean;
  createdAt: string;
}
```

Manifest 包含所有 item、case、hash tree、簽章、建立人與版本。

## 6. Chain of Custody

每次操作皆記錄：

- view
- preview
- download request
- signed URL issue
- export
- handoff to police / authority / insurer
- copy creation
- redaction / masking
- legal hold / release

原始檔不覆寫，衍生檔要指回 original evidence ID。

## 7. AccidentCase

狀態：

```text
detected
roc_acknowledged
operation_suspended
emergency_response_active
evidence_frozen
initial_notification_sent
investigation_active
corrective_action_required
authority_review
resume_authorized
closed
```

## 8. Accident Investigation Bundle

- case overview
- booking / order / dispatch
- experiment / jurisdiction / approval snapshots
- vehicle and Tesla integration state
- FSD session and transition events
- safety operator reports
- ROC actions
- telemetry charts and gaps
- synchronized videos
- route and geofence comparison
- commands and provider receipts
- notifications and acknowledgements
- external police / insurer documents
- evidence manifest and custody log
- known gaps / unavailable provider data

系統只提供調查資料，不輸出「Tesla 有責／安全員有責」等結論。

## 9. Data Confidence

每個 timeline fact 標示：

```text
provider_signed
provider_unsigned
sensor_confirmed
operator_reported
roc_reported
system_derived
external_authority_provided
unknown
```

System-derived item 必須有 derivation rule 和 confidence，且不可覆蓋 provider-signed fact。
