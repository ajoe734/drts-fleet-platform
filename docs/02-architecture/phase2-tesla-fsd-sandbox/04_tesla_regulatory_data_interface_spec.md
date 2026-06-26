# Tesla Taiwan Regulatory Data Interface Specification


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. 文件目的

本文件是我方與 Tesla／Tesla 授權合作單位討論台灣監理沙盒資料介面的正式技術基準。公開 Fleet API／Fleet Telemetry 不足以保證完整 FSD session、接管／脫離、原因碼與事故資料；因此將這些能力定義為專案合作契約，不在程式中假設其已存在。

## 2. 必要能力

### 2.1 Capability Profile

```ts
interface TeslaRegulatoryCapabilityProfile {
  vin: string;
  providerVehicleId: string;
  firmwareVersion: string | null;
  hardwareGeneration: string | null;
  fleetTelemetryAvailable: boolean;
  selfDrivingStatisticsAvailable: boolean;
  fsdSessionFeedAvailable: boolean;
  autonomyTransitionFeedAvailable: boolean;
  takeoverReasonAvailable: boolean;
  historicalBackfillAvailable: boolean;
  sessionSummaryAvailable: boolean;
  incidentEvidenceAvailable: boolean;
  providerSignatureAvailable: boolean;
  sequenceGuaranteed: boolean;
  eventLatencySlaSec: number | null;
  limitations: string[];
  schemaVersion: string;
  assessedAt: string;
}
```

載客 gate：主管機關要求的 required capabilities 任一缺失，車輛不可進入沙盒載客服務。

### 2.2 FSD Session Record

```ts
interface TeslaFsdSessionRecord {
  providerSessionId: string;
  vin: string;
  startedAt: string;
  endedAt: string | null;
  startLocation: GeoPoint | null;
  endLocation: GeoPoint | null;
  totalDistanceKm: number | null;
  fsdDistanceKm: number | null;
  softwareVersion: string | null;
  hardwareGeneration: string | null;
  terminationType: string | null;
  providerTripReference: string | null;
  schemaVersion: string;
  providerSignature: string | null;
}
```

### 2.3 Autonomy Transition Event

```ts
type TeslaAutonomyEventType =
  | "fsd_engaged"
  | "fsd_disengaged"
  | "manual_takeover"
  | "driver_override"
  | "system_requested_takeover"
  | "minimum_risk_stop"
  | "session_ended_normally"
  | "unknown_transition";

interface TeslaAutonomyTransitionEvent {
  providerEventId: string;
  providerSessionId: string | null;
  vin: string;
  occurredAt: string;
  sequenceNumber: number | null;
  stateBefore: string | null;
  stateAfter: string | null;
  eventType: TeslaAutonomyEventType;
  triggerSource: string | null;
  providerReasonCode: string | null;
  location: GeoPoint | null;
  vehicleSpeedKph: number | null;
  softwareVersion: string | null;
  hardwareGeneration: string | null;
  telemetryWindowReference: string | null;
  evidenceReference: string | null;
  schemaVersion: string;
  providerSignature: string | null;
}
```

不要求方向盤角度、煞車深度或 perception object。若 Tesla 額外提供，必須經獨立 decision packet 才能納入監理 contract。

### 2.4 Session Summary

```ts
interface TeslaAutonomySessionSummary {
  providerSessionId: string;
  vin: string;
  startedAt: string;
  endedAt: string;
  totalDistanceKm: number | null;
  fsdDistanceKm: number | null;
  humanDrivenDistanceKm: number | null;
  engagementCount: number | null;
  disengagementCount: number | null;
  manualTakeoverCount: number | null;
  eventIds: string[];
  dataCompleteness: "complete" | "partial" | "unavailable";
  missingFields: string[];
  generatedAt: string;
  providerSignature: string | null;
}
```

### 2.5 Incident Evidence Reference

```ts
interface TeslaIncidentEvidenceReference {
  providerIncidentId: string;
  vin: string;
  providerEventIds: string[];
  telemetryWindowStart: string;
  telemetryWindowEnd: string;
  availableDataTypes: string[];
  downloadReferences: Array<{
    type: string;
    reference: string;
    expiresAt: string | null;
    checksum: string | null;
  }>;
  retentionDeadline: string | null;
  providerCertification: string | null;
}
```

不得假設 Tesla 一定提供影像；若無，需明確 `video_not_available_from_provider`。

## 3. Transport Contract

### 3.1 Push Event

```http
POST /internal/providers/tesla/regulatory-events
Content-Type: application/json
X-Tesla-Event-Id: ...
X-Tesla-Schema-Version: ...
X-Tesla-Signature: ...
```

安全：

- mTLS
- JWS / detached signature
- allowlisted provider identity
- replay window
- idempotency
- payload size limit
- exact raw header capture

Response：

```json
{
  "accepted": true,
  "receiptId": "trr_01...",
  "receivedAt": "2026-06-25T00:00:00Z",
  "duplicate": false
}
```

### 3.2 Historical Backfill

Provider 需支援等價能力：

```text
vin
from / to
providerSessionId
providerEventId
sequenceAfter
pageToken
```

### 3.3 Delivery Semantics

- at-least-once delivery
- stable event ID
- sequence where possible
- event timestamp and receive timestamp separated
- schema version required
- retry with exponential backoff
- backfill minimum retention period to be negotiated

## 4. SLA / Quality Requirements

建議合作條款：

- critical transition event p95 delivery <= 5 sec
- normal session event p95 <= 30 sec
- session summary <= 10 min after session end
- provider event availability >= 99.9% during approved operation windows
- historical backfill available for the regulator-approved retention period
- planned schema changes notified >= 60 days before effective date
- emergency breaking changes immediately communicated through named contacts

最終數值以 Tesla 協議與沙盒核准條件為準。

## 5. Reason Code Governance

Tesla 需提供：

- reason code dictionary
- code version
- definition
- deprecated／new code notice
- whether code is technical fact, inferred classification, or unavailable

我方保存原始 reason code，不自行重新分類為責任判定。

## 6. Data Residency / Disclosure

合作文件需確認：

- 原始資料產生與保存地
- 台灣本地落地資料範圍
- 跨境傳輸
- 主管機關調閱流程
- Tesla 對事故資料的交付窗口
- 個資與乘客資料最小化
- 資料刪除與 legal hold 衝突處理

## 7. Acceptance Tests

1. valid signed event accepted
2. invalid signature rejected and security-audited
3. duplicate event idempotent
4. out-of-order sequence preserved and reconciled
5. sequence gap triggers backfill
6. unknown schema quarantined, raw payload preserved
7. session summary correlated to local trip
8. regulatory event correlated to safety operator report
9. provider downtime causes dispatch hold after threshold
10. incident evidence reference incorporated into evidence manifest
