# Phase 2 API／Contract Catalog


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. Route Families

### Tesla Integration

```http
POST   /api/tesla/integrations
GET    /api/tesla/integrations
POST   /api/tesla/integrations/{{id}}/authorize
POST   /api/tesla/vehicles/{{vin}}/pair-virtual-key
POST   /api/tesla/vehicles/{{vin}}/configure-telemetry
GET    /api/tesla/vehicles/{{vin}}/capabilities
GET    /api/tesla/vehicles/{{vin}}/health
POST   /api/tesla/vehicles/{{vin}}/commands/{{commandCode}}
```

### Tesla Regulatory Events

```http
POST   /internal/providers/tesla/regulatory-events
POST   /api/tesla/regulatory/backfill
GET    /api/tesla/regulatory/events
GET    /api/tesla/regulatory/sessions/{{sessionId}}
GET    /api/tesla/regulatory/incidents/{{providerIncidentId}}
```

### Sandbox Governance

```http
GET/POST /api/sandbox/experiments
GET/PUT  /api/sandbox/experiments/{{id}}
POST     /api/sandbox/experiments/{{id}}/publish
POST     /api/sandbox/experiments/{{id}}/suspend
POST     /api/sandbox/experiments/{{id}}/resume-authorizations
GET/POST /api/sandbox/experiments/{{id}}/routes
GET/POST /api/sandbox/experiments/{{id}}/vehicles
GET/POST /api/sandbox/experiments/{{id}}/safety-operators
POST     /api/sandbox/dispatch/evaluate
```

### Safety Operator

```http
POST /api/safety-operator/shifts/start
POST /api/safety-operator/shifts/end
POST /api/safety-operator/vehicle-assignments
POST /api/safety-operator/pre-trip-checklists
POST /api/safety-operator/takeovers
POST /api/safety-operator/incidents
POST /api/safety-operator/reports/{{id}}/sync
```

### ROC

```http
GET  /api/roc/overview
GET  /api/roc/vehicles
GET  /api/roc/trips
GET  /api/roc/takeovers
GET  /api/roc/alerts
POST /api/roc/alerts/{{id}}/acknowledge
POST /api/roc/vehicles/{{vehicleId}}/hold
POST /api/roc/trips/{{tripId}}/request-safety-action
POST /api/roc/trips/{{tripId}}/fallback-to-human
POST /api/roc/incidents
```

### Evidence / Investigation

```http
POST /api/evidence/freezes
GET  /api/evidence/freezes/{{id}}
POST /api/evidence/objects/register
POST /api/evidence/manifests
POST /api/evidence/legal-holds
POST /api/evidence/exports
GET  /api/accident-cases/{{id}}/timeline
POST /api/accident-cases/{{id}}/bundles
```

### Regulatory Reporting

```http
POST /api/regulatory/reports/jobs
GET  /api/regulatory/reports/jobs/{{id}}
POST /api/regulatory/notifications
POST /api/regulatory/notifications/{{id}}/acknowledge
GET  /api/regulatory/experiments/{{id}}/compliance-summary
```

## 2. Shared Envelopes

```ts
interface Phase2SourceMetadata {
  source: "tesla_public" | "tesla_regulatory" | "safety_operator" | "roc" | "system" | "external_authority";
  sourceRecordId: string | null;
  confidence: "provider_signed" | "provider_unsigned" | "sensor_confirmed" | "reported" | "derived" | "unknown";
  observedAt: string;
  receivedAt: string;
}

interface ProviderCapabilityRequirement {
  capabilityCode: string;
  required: boolean;
  available: boolean;
  limitation: string | null;
}

interface CommandReceipt {
  commandId: string;
  provider: "tesla";
  vin: string;
  commandCode: string;
  requestedBy: string;
  reasonCode: string;
  requestedAt: string;
  providerAcknowledgedAt: string | null;
  status: "accepted" | "succeeded" | "failed" | "timed_out" | "unknown";
  providerReference: string | null;
  auditId: string;
}
```

## 3. Error Codes

```text
TESLA_AUTH_REQUIRED
TESLA_VIRTUAL_KEY_NOT_PAIRED
TESLA_TELEMETRY_UNAVAILABLE
TESLA_REGULATORY_CAPABILITY_MISSING
TESLA_REGULATORY_SIGNATURE_INVALID
TESLA_REGULATORY_SEQUENCE_GAP
TESLA_SCHEMA_UNSUPPORTED
SANDBOX_EXPERIMENT_NOT_ACTIVE
SANDBOX_OUTSIDE_APPROVED_AREA
SANDBOX_OUTSIDE_APPROVED_TIME
SANDBOX_VEHICLE_NOT_APPROVED
SANDBOX_SAFETY_OPERATOR_NOT_QUALIFIED
SANDBOX_EVIDENCE_RECORDER_UNHEALTHY
SANDBOX_TELEMETRY_STALE
SANDBOX_REGULATORY_DATA_STALE
SANDBOX_OPERATIONAL_HOLD
TAKEOVER_CORRELATION_AMBIGUOUS
EVIDENCE_FREEZE_ALREADY_ACTIVE
EVIDENCE_HASH_MISMATCH
EVIDENCE_LEGAL_HOLD_ACTIVE
REGULATORY_NOTIFICATION_OVERDUE
```

## 4. Idempotency

- provider event: providerEventId
- safety report: clientGeneratedReportId
- evidence freeze: caseId + triggerId
- Tesla command: idempotencyKey
- regulatory notification: caseId + notificationType + version
