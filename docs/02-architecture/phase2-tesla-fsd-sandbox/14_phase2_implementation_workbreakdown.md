# Phase 2 完整實作工作清單


> 文件基準日：2026-06-25  
> 適用專案：計程車自動駕駛專案 Phase 2  
> 正式定位：**Tesla FSD 在地監理沙盒營運、安全監控與事故證據平台**  
> 系統邊界：Tesla 負責 FSD 感知、規劃與車輛控制；本平台負責在地監理、沙盒條件、Tesla 資料介接、行控、安全員、事故、證據與監理報告。  
> 明確排除：不建置路側 RSU／SPaT／V2X，不監看方向盤角度、煞車深度或 Tesla 內部感知物件，不建立遠端駕駛或第三方 FSD 控制。


## 1. 工作包總覽

| ID | Work Package | 主要交付 |
|---|---|---|
| P2-ARCH-001 | Canonical docs / decisions | SA, SD, PRD, decision ledger, traceability |
| P2-TESLA-001 | Public Fleet integration | OAuth, token, VIN, virtual key, telemetry config |
| P2-TESLA-002 | Regulatory provider contract | capability, session, transition, summary, incident ref |
| P2-TESLA-003 | Event ingress | mTLS/JWS, raw vault, normalize, idempotency |
| P2-TESLA-004 | Gap/backfill | sequence tracker, backfill, quarantine, health |
| P2-GOV-001 | Experiment / jurisdiction | programs, approvals, local contacts, policies |
| P2-GOV-002 | Route / time / enrollment | PostGIS route, vehicle/operator enrollment |
| P2-GATE-001 | Dispatch eligibility | evaluator, snapshot, reason codes, Phase 1 hook |
| P2-SAFE-001 | Safety Operator contracts/API | shift, assignment, checklist, takeover, offline sync |
| P2-SAFE-002 | Driver App safety mode | UI and mobile workflow |
| P2-ROC-001 | ROC backend read models | vehicles/trips/alerts/takeovers/provider health |
| P2-ROC-002 | ROC Console | live board, queues, actions, handover |
| P2-EVD-001 | Vehicle recorder integration | recorder registry, health, segment index |
| P2-EVD-002 | Evidence freeze/vault | freeze, manifest, hash, legal hold, access log |
| P2-ACC-001 | Accident cases | lifecycle, timeline, discrepancy, external docs |
| P2-ACC-002 | Investigation bundle | synchronized exports, manifest, controlled download |
| P2-REG-001 | Regulatory notifications | matrix, timers, submission/acknowledgement |
| P2-REG-002 | Reports | daily/trip/takeover/incident/completeness/report package |
| P2-FBK-001 | Human taxi fallback | same booking, fallback assignment, ETA, audit |
| P2-NFR-001 | Security/infra | GCP, queues, PostGIS, storage lock, monitoring |
| P2-TEST-001 | Automated tests | unit/integration/E2E |
| P2-UAT-001 | Pilot UAT/drills | normal/takeover/accident/outage/fallback |

## 2. Detailed Tasks

### P2-TESLA-001 Public Fleet Integration

- Tesla app registration config
- business/third-party auth as agreed
- token store/refresh/revoke
- region handling
- VIN discovery and binding
- virtual key state
- Fleet Telemetry configure/status
- allowlisted vehicle commands and CommandReceipt
- API cost/rate limit metrics

Acceptance：real Tesla test account/vehicle or official sandbox produces valid telemetry.

### P2-TESLA-002 Regulatory Provider Contract

- finalize interface with Tesla
- capability profile
- event and reason code schemas
- push/backfill/session/incident contracts
- signature and SLA
- data residency and retention
- schema change process

Acceptance：signed technical agreement or provider-approved sandbox spec; no guessed production endpoint.

### P2-TESLA-003 Event Ingress

- dedicated ingress service
- mTLS/JWS
- raw payload immutable storage
- idempotency and receipt
- normalizer registry by schema version
- canonical event store
- alert hooks

### P2-GOV-001/002

- CRUD and versioning
- approval artifact upload/hash
- local jurisdiction and notification matrix
- PostGIS routes/areas
- schedules and exceptions
- vehicle/operator enrollment
- policy snapshot API

### P2-GATE-001

- all eligibility checks
- fail-closed behavior
- manual release action
- Phase 1 dispatch hook
- snapshot and audit
- fallback reason mapping

### P2-SAFE-001/002

- device-bound identity
- shift/qualification
- vehicle assignment
- checklist
- takeover report
- offline queue
- incident upload
- trip closeout

### P2-ROC-001/002

- polling/SSE according to existing UI runtime architecture
- live board
- provider health
- takeover correlation queue
- evidence freeze and incident actions
- fallback and passenger recovery link
- handover report

### P2-EVD-001/002

- recorder vendor adapter interface
- health and segment indexing
- event bookmark
- upload retry
- freeze orchestration
- manifest and object lock
- controlled export

### P2-ACC-001/002

- accident state machine
- evidence discrepancy
- synchronized timeline
- investigation bundle
- police/authority/insurer handoff log

### P2-REG-001/002

- notification policy engine
- deadlines and reminders
- draft/review/submit/acknowledge
- report templates and exports
- resume authorization

## 3. Dependencies

```text
ARCH
 ├─ TESLA-001 ─┬─ TESLA-003 ─ TESLA-004
 │              └─ TESLA-002
 ├─ GOV-001 ─ GOV-002 ─ GATE-001
 ├─ SAFE-001 ─ SAFE-002
 ├─ ROC-001 ─ ROC-002
 ├─ EVD-001 ─ EVD-002 ─ ACC-001 ─ ACC-002
 └─ REG-001 ─ REG-002

GATE-001 + TESLA + SAFE + ROC + EVD → UAT
Phase 1 integration required by GATE, FALLBACK, INCIDENT, BILLING, AUDIT
```

## 4. Definition of Done per Task

每個 task 必須有：

- contract and error codes
- migrations
- unit/integration tests
- audit events
- API client
- UI/consumer adoption where applicable
- runbook
- evidence artifact
- gate level and remaining non-claim

## 5. External Inputs Register

| Input | Owner | Blocking Scope |
|---|---|---|
| Tesla Fleet API account/vehicle | Tesla/business team | public integration evidence |
| Tesla Regulatory Data contract | Tesla + legal + system design | takeover/session authority |
| Sandbox approval conditions | regulator / project owner | policy configuration |
| Local police/fire/EMS contacts | local operator | jurisdiction/notification |
| Evidence recorder vendor/API | procurement/integration | accident video proof |
| Insurance and reporting requirements | legal/insurance | incident/report templates |

No external input permits engineering to invent FSD facts; blocked fields stay capability-gated.
