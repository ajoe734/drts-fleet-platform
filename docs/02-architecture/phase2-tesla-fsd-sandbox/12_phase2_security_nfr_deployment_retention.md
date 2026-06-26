# Phase 2 安全、NFR、部署與保存規格


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. Security Domains

### 1.1 Tesla Provider Ingress

- mTLS
- provider certificate allowlist
- JWS signature
- replay window
- stable event ID
- payload hash
- schema allowlist
- WAF / rate limit
- no public browser access

### 1.2 Human Identities

- Platform Admin / ROC: SSO + MFA + IAP/VPN policy
- Safety Operator: device-bound mobile session
- Compliance / Investigator: least privilege, step-up MFA for export
- Regulator viewer: scoped read-only, time-bound access

### 1.3 Secrets

- Secret Manager
- KMS encryption
- Tesla tokens scoped per environment
- virtual key private material isolated from app runtime where possible
- no secrets in logs / payload snapshots

## 2. NFR Targets

| Metric | Target |
|---|---|
| Fleet telemetry ingestion p95 | <= 5 sec from receive to queryable projection |
| Regulatory transition event alert p95 | <= 10 sec from local receipt |
| ROC alert acknowledgement UX | command response <= 2 sec p95 |
| Evidence freeze initiation | <= 30 sec from qualifying trigger |
| Provider sequence gap detection | <= 60 sec after expected threshold |
| Control-plane availability during approved windows | 99.9% target |
| Raw provider event durability after acknowledgement | no acknowledged-event loss target |
| OLTP RPO | <= 5 min target |
| Critical operational RTO | <= 60 min target |

Targets are engineering baselines; approval conditions may be stricter.

## 3. Data Retention

Policy categories：

- normal telemetry
- FSD session / transition events
- safety operator reports
- ROC actions
- normal video
- incident video
- accident bundle
- regulatory notifications
- audit / access logs

Retention is configurable. DRTS reference uses 30-day normal video and 3-year incident/fault video, but Phase 2 uses the actual approval and legal policy as source of truth.

## 4. Evidence Storage

Cloud Storage buckets separated by purpose：

```text
raw-provider-events
telemetry-archive
video-normal
video-incident-locked
investigation-bundles
regulatory-reports
```

Controls：

- versioning
- retention policy
- object hold / legal hold
- CMEK for sensitive buckets
- signed URL <= 15 minutes default
- download audit
- separate original and redacted derivative

## 5. Deployment

### Environments

```text
local
shared-dev
sandbox-integration
staging
pilot
production
```

`sandbox-integration` connects to Tesla sandbox/mock regulatory feed; `pilot` is named experiment/vehicle/operator environment.

### GCP Services

- Cloud Run / GKE only where protocol requires long-lived connections
- Pub/Sub
- Cloud SQL PostgreSQL + PostGIS
- BigQuery for analytics
- Cloud Storage
- Secret Manager / KMS
- Cloud Monitoring / Logging
- Artifact Registry

## 6. Telemetry Data Quality

Per VIN：

- expected fields
- last seen
- stale threshold
- missing ratio
- out-of-order ratio
- invalid location ratio
- clock skew
- schema version
- backfill status

Quality score affects dispatch eligibility but not Tesla driving behavior.

## 7. Privacy

- passenger cabin recording only when approval, notice and necessity are established
- minimize passenger identifiers in Tesla-related payloads
- use trip correlation IDs instead of names
- role-based masking
- controlled disclosure to police / insurer / authority
- export watermark and case reference

## 8. Disaster Recovery

- multi-zone DB
- durable event queue
- raw provider vault independent of canonical projection
- regular restore test
- evidence manifest verification after restore
- ROC degraded-mode runbook
- no-new-AV-dispatch when critical control plane unavailable
