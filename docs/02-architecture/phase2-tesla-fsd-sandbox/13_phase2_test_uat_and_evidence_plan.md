# Phase 2 測試、UAT 與 Evidence Plan


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. Test Layers

### Unit

- policy evaluator
- capability gate
- event normalization
- signature verification wrapper
- sequence gap detection
- takeover correlation
- evidence manifest hashing
- state machines

### Integration

- Tesla public mock / regulatory mock
- PostgreSQL / PostGIS route check
- Pub/Sub ingestion
- object storage and legal hold
- Phase 1 booking / dispatch / incident / billing integration

### E2E

建議：

```text
E2E-P2-001 Tesla vehicle onboarding
E2E-P2-002 Sandbox dispatch eligibility
E2E-P2-003 Normal Tesla sandbox trip
E2E-P2-004 Takeover correlation
E2E-P2-005 Provider sequence gap and backfill
E2E-P2-006 Evidence freeze and manifest
E2E-P2-007 Accident investigation bundle
E2E-P2-008 Human taxi fallback
E2E-P2-009 Suspension and resume
E2E-P2-010 Regulatory report package
```

## 2. UAT Scenarios

### UAT-AV-001 Normal trip

- approved vehicle/operator/route/time
- destination push receipt
- telemetry visible
- session summary linked
- completion and reporting

### UAT-AV-002 Outside approved area

Expected：ineligible；no Tesla assignment；reason visible；human fallback available。

### UAT-AV-003 Required capability missing

Expected：vehicle cannot enter passenger sandbox service。

### UAT-AV-004 Tesla takeover event + operator report

Expected：correlated case, distinct timestamps and sources, ROC alert。

### UAT-AV-005 Data conflict

Expected：discrepancy case, no silent overwrite。

### UAT-AV-006 Collision

Expected：operational hold, evidence freeze, notification timer, fallback, investigation bundle。

### UAT-AV-007 Regulatory feed outage

Expected：backfill; after threshold stop new dispatch; active trip procedure visible。

### UAT-AV-008 Evidence recorder failure

Expected：no new trip; recorder health incident and maintenance action。

### UAT-AV-009 Controlled evidence export

Expected：step-up auth, reason, short URL, manifest, access log。

### UAT-AV-010 Human fallback

Expected：same booking/order context, new human assignment, revised ETA, sandbox exception report。

## 3. Drills

- takeover drill
- accident drill
- provider outage drill
- telemetry gap drill
- evidence freeze drill
- local police/fire/EMS notification drill
- production rollback and restore drill
- data integrity / hash verification drill

## 4. Evidence Levels

```text
repo-local
static evidence
Tesla sandbox evidence
live staging evidence
named pilot evidence
production evidence
```

Mock adapter cannot upgrade a gate to Tesla sandbox evidence.

## 5. Release Gates

### Gate A - Architecture Ready

- SA/SD accepted
- Tesla data contract draft accepted internally
- legal / privacy / jurisdiction review

### Gate B - Repo Ready

- modules/contracts/DDL landed
- unit/integration/E2E repo-local green

### Gate C - Tesla Sandbox Ready

- public Tesla integration
- regulatory sandbox adapter
- signed events / backfill / session summary

### Gate D - Vehicle Ready

- real VIN
- capability profile
- evidence recorder
- safety operator
- readiness drill

### Gate E - Pilot Ready

- regulator-approved plan loaded
- normal/takeover/accident/fallback drills
- named local contacts
- reporting package

### Gate F - Production/Pilot Operation

- named approval
- monitoring and on-call
- rollback / suspension / resume
- evidence retention active
