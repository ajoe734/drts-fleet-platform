# Phase 1 營運閉環完整補完規劃書

狀態：comprehensive planning supplement  
日期：2026-04-30  
適用範圍：`drts-fleet-platform`、`tenant-commute-hub`

## 1. 文件目的

本文件是對下列文件的完整補完規劃版：

- `phase1_system_analysis_v1.md`
- `docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`
- `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
- `docs/02-architecture/phase1-role-scenario-and-negative-flow-matrix-20260430.md`

前面幾份文件已經回答：

- 系統有哪些 domain
- 角色有哪些
- 使用情境有哪些
- 哪些缺口存在
- 設計原則應該長什麼樣子

本文件進一步回答：

1. 這些缺口要如何一次完整補完
2. 要補哪些流程、狀態、畫面、API、runbook、驗收
3. 哪些是 Phase 1 必補，哪些可後續迭代
4. 每一類缺口收斂完成的定義是什麼

這份規劃書的目標不是再列一次問題，而是把「現在缺少的內容」收斂成可直接拿去拆 PRD / SD / UI / backend / runbook / UAT 的完整規劃基礎。

## 2. 規劃原則

### 2.1 不重做 bounded context，只補營運閉環

- 不推翻既有 `apps/api` 的 domain 分層
- 不重開 Passenger App / Web、Call Point Portal、Concierge Portal、AV / ODD / Tesla 家族
- 補的是 Phase 1 可營運、可治理、可審計、可交接的閉環

### 2.2 正流程與負流程同等重要

任何補完規劃都必須同時回答：

- happy path 怎麼走
- 失敗時誰接手
- 需要補件時誰負責
- 何時可 override
- override 需要誰核准
- 失敗如何留痕與對帳

### 2.3 先收斂 authority，再優化 UX

優先順序：

1. auth / identity / actor / audit 正確
2. 狀態機與責任邊界正確
3. operator / tenant / partner / driver UX 補完
4. map、批量操作、可視化優化

### 2.4 每個營運動作都要有 owner

任何下列情況都必須明確指派 owner：

- 建立
- 審核
- 啟用
- 停權
- 駁回
- 轉人工
- override
- reopen
- reconcile
- archive

## 3. 補完範圍總覽

本規劃把需要補完的內容收成 12 大工作包：

1. 身份與入口閉環
2. 主檔與開通閉環
3. 渠道進單閉環
4. 派遣與重派閉環
5. 司機履約與 proof 閉環
6. 客訴 / 事故 / 升級閉環
7. 財務 / 對帳 / reconciliation 閉環
8. 報表 / 稽核 / artifact / retention 閉環
9. tenant API / webhook / partner / forwarder integration 閉環
10. 地圖 / 即時位置 / 營運可視化閉環
11. runbook / ownership / release gate 閉環
12. 驗收 / UAT / negative-path coverage 閉環

## 4. 角色與責任模型

### 4.1 外部角色正式責任

| 角色                     | 核心責任                            | 不應負責                                      |
| ------------------------ | ----------------------------------- | --------------------------------------------- |
| `tenant_admin`           | tenant 設定、使用者、基本治理       | 平台 pricing authority、內部供給治理          |
| `tenant_ops_admin`       | 建單、查單、處理 tenant 營運通知    | 控制派遣 authority、人工 override 合規 gate   |
| `tenant_finance_admin`   | invoice、報表、月結                 | 平台 settlement rule 定義                     |
| `tenant_technical_admin` | API keys、webhooks、delivery review | 後端 auth policy 定義                         |
| `partner_portal_user`    | partner booking 建立與查詢          | 租戶或平台層級治理                            |
| `partner_api_client`     | partner ingress API 呼叫            | 自行決定平台最終 order truth                  |
| `driver_user`            | 接單、履約、事件、proof、收益檢視   | 自行改 dispatch authority、改價、跳過必填證據 |

### 4.2 內部角色正式責任

| 角色                     | 核心責任                                        | 關鍵負流程 owner                                               |
| ------------------------ | ----------------------------------------------- | -------------------------------------------------------------- |
| `platform_admin`         | 平台級治理、租戶、開關、健康、審計              | tenant rollout gate、partner activation、高敏感設定            |
| `platform_partner_admin` | partner / bank / program / entry 開通           | partner inactive / revoke / rollback                           |
| `driver_admin`           | driver master、device binding、suspend / retire | driver suspend / rebind / revoke                               |
| `fleet_admin`            | vehicle / insurance / contract / exclusivity    | expired insurance、offboarding、dispatchability revoke         |
| `dispatcher`             | queue、派遣、改派、重派、人工放行               | no-supply、reject、timeout、exception hold                     |
| `ops_supervisor`         | 監看 SLA、queue、營運例外                       | delayed queue escalation、manual reassignment approval         |
| `call_center_agent`      | call session、phone order、callback             | recording pending、invalid caller data、call complaint handoff |
| `complaint_specialist`   | complaint case、reopen、結案                    | SLA breach、evidence request、reopen handling                  |
| `incident_operator`      | incident、營運事件、升級                        | service recovery、incident escalation                          |
| `finance_user`           | invoice、statement、reconciliation、payment     | mismatch、sponsor dispute、payout correction                   |
| `compliance_user`        | proof、recording、retention、filing             | legal hold、gate override review、artifact access              |
| `audit_user`             | 高敏感存取與稽核                                | suspicious access review、download trace review                |

### 4.3 機器角色正式責任

| 角色                         | 責任                                              |
| ---------------------------- | ------------------------------------------------- |
| `realtime_matcher`           | 候選供給計算與 dispatch attempt 產生              |
| `reservation_scheduler`      | 預約單窗口、預派、轉人工                          |
| `sla_monitor`                | SLA flag 與 alert 產生                            |
| `billing_job`                | invoice / statement / reimbursement artifact 產生 |
| `filing_generator`           | filing package / export package 產生              |
| `forwarder_adapter`          | external order mirror 與 sync                     |
| `issuer_eligibility_adapter` | issuer / bank eligibility verify                  |

## 5. 完整補完規劃

### 5.1 工作包 A：身份與入口閉環

#### A1. 平台 / ops control-plane auth 收尾

需要補完：

- 平台與 ops 角色矩陣
- realm / audience / trust boundary 文件
- bootstrap header 僅限 local/dev 的技術與文件保證
- negative verification：
  - missing token
  - wrong audience
  - wrong realm
  - expired token

完成線：

- `platform-admin-web` 與 `ops-console-web` 全部受一致 control-plane auth 保護
- docs / runbook / tests 對同一套規則沒有矛盾

#### A2. tenant / partner / driver 分平面 auth 收尾

需要補完：

- tenant bootstrap session lifecycle
- partner ingress auth contract
- driver device-bound auth
- 各平面 scopes 與 actor projection

必補負流程：

- wrong tenant scope
- wrong partner entry scope
- inactive entry
- revoked device
- suspended driver
- expired bootstrap session

完成線：

- 不存在「前端自己決定身份」或「靠 header 假裝 production auth」的情況

#### A3. 司機進 App 的正式模型

正式流程：

1. 平台建立 `driver master`
2. 平台為 driver 發一個 `device registration invitation`
3. App 首次啟動進 `device registration`
4. App 送 device fingerprint / registration token
5. Backend 建立 device binding
6. Backend 核發短期 access token + refresh token
7. App 以 bearer session 進入 onboarding / jobs

負流程：

- invitation expired
- token replay
- unapproved device
- device revoked
- driver suspended
- driver cert invalid
- refresh token revoked

必做畫面：

- driver-app：`DeviceNotProvisioned`
- driver-app：`RegisterDevice`
- platform-admin：`Driver Devices`
- platform-admin：`Revoke / Rebind Device`

### 5.2 工作包 B：主檔與開通閉環

#### B1. Driver master lifecycle

主檔欄位至少包含：

- driverId
- legalName / displayName
- tenant / fleet affiliation
- service buckets
- work state
- certification state
- device binding summary
- dispatch eligibility state
- onboarding state

狀態機：

- `draft`
- `pending_documents`
- `ready_for_activation`
- `active`
- `suspended`
- `retired`

關鍵規則：

- `draft` / `pending_documents` 不得可派
- `suspended` 不得 refresh mobile token
- `retired` 不得再綁新 device

必補負流程：

- duplicate national identity / employee id
- missing cert
- expired cert
- reassigned vehicle mismatch
- driver suspended during active shift

#### B2. Vehicle / insurance / contract / exclusivity lifecycle

主檔拆分：

- `vehicle master`
- `insurance policy`
- `contract record`
- `exclusivity review`
- `debranding task`

狀態機：

- vehicle: `draft` -> `active` -> `dispatchable` -> `suspended` -> `offboarding` -> `retired`
- insurance: `valid` / `expiring_soon` / `expired`
- exclusivity: `pending` / `approved` / `rejected`

關鍵規則：

- insurance expired => 立即不可派
- exclusivity not approved => 不可打開 dispatchable
- contract terminated => vehicle 進 offboarding + debranding task

必補畫面：

- platform-admin：vehicle lifecycle table
- ops-console：dispatchability warnings
- alert surface：expiring insurance / rejected exclusivity

#### B3. Tenant onboarding lifecycle

狀態機：

- `draft`
- `configured`
- `sandbox_ready`
- `pilot_ready`
- `production_active`
- `rollback_hold`
- `suspended`

建立流程：

1. 建 tenant
2. 設 default roles
3. 設 billing profile baseline
4. 設 notification / webhook baseline
5. 設 optional partner / integration package
6. 設 rollout gate evidence

必補負流程：

- invited roles 未確認
- tenant contract incomplete
- required settings missing
- pilot evidence incomplete
- rollback requested

#### B4. Partner / bank / program / entry onboarding lifecycle

模型拆分：

- `partner`
- `partner_program`
- `partner_entry`
- `partner_credential`
- `eligibility_profile`

狀態機：

- partner: `draft` / `active` / `inactive`
- program: `draft` / `pilot` / `production`
- entry: `draft` / `configured` / `active` / `inactive` / `revoked`
- credential: `issued` / `rotated` / `revoked`

必要欄位：

- partnerCode
- programCode / programId
- entrySlug
- authMode
- eligibilityMode
- support contacts
- branding
- tenant scope
- sponsor / billing metadata

必補負流程：

- slug conflict
- wrong tenant binding
- credential compromise
- inactive entry still referenced by portal route
- eligibility profile changed after active bookings exist

### 5.3 工作包 C：渠道進單閉環

#### C1. tenant booking

需明文化：

- 哪些角色可建單
- 哪些 booking fields 為 required
- modifiable window
- cancellation window
- reservation window
- contract-driven proof requirements

負流程：

- address unresolvable
- out-of-service area
- contract not allowed
- late modification
- duplicate submission

#### C2. partner airport booking

需明文化：

- partner-only fields
- benefit reference rules
- flight number rules
- airport direction rules
- eligibility verification linkage

負流程：

- `FLIGHT_NO_REQUIRED`
- invalid benefit reference
- ineligible cardholder
- entry inactive
- issuer timeout
- wrong partner to tenant binding

#### C3. phone order

必做工作台欄位：

- caller phone
- caller name
- passenger name
- pickup / dropoff
- immediate vs reservation
- notes
- accessibility / special needs
- quote ETA
- callId
- recording state
- complaint handoff shortcut

正式流程：

1. CTI 建立 call session
2. agent announce identity
3. operator 填表
4. 建立 phone order
5. 綁 callId
6. recording callback 到達後補齊 recordingId
7. order 根據 compliance state 進 queue 或 hold

負流程：

- recording unavailable
- recording callback late
- caller hangs up mid-entry
- duplicate order from same call
- wrong passenger address

#### C4. forwarder inbound order

需明文化：

- external order id
- platform code
- local mirror order id
- sync authority
- driver-facing constraints
- mirror settlement projection

負流程：

- lost race
- cancelled_by_platform
- sync_failed
- platform_confirm timeout
- adapter degraded
- reconciliation mismatch

### 5.4 工作包 D：派遣與重派閉環

#### D1. Queue-entry policy

必須定義的 queue families：

- `realtime_ready_queue`
- `reservation_confirmation_queue`
- `redispatch_priority_queue`
- `exception_hold_queue`
- `recording_gate_queue`
- `manual_review_queue`

必須定義的進隊規則：

- `ready_for_dispatch` 進 `realtime_ready_queue`
- reservation within confirmation window 進 `reservation_confirmation_queue`
- `redispatch_required` 進 `redispatch_priority_queue`
- `recording_pending` 進 `recording_gate_queue`
- `exception_hold` 進 `exception_hold_queue`

#### D2. 派遣操作模型

dispatch action taxonomy：

- `suggest_candidates`
- `assign`
- `reserve_supply`
- `reassign`
- `redispatch`
- `cancel_assignment`
- `manual_override_release`

每個動作都必須有：

- actor
- reason code
- request id
- source screen
- old state
- new state

#### D3. No supply / delay / area unavailable handling

需定義 operator decision tree：

- area not serviceable => 拒絕建單或明確 unavailable
- temporarily no supply => queue and monitor
- repeated candidate exhaustion => supervisor escalation
- SLA breach risk => notify tenant / partner / call center

#### D4. Exception hold 與 override

override types：

- recording override
- proof override
- eligibility fallback review
- manual dispatch override

override 必填：

- override_type
- requested_by
- approved_by
- reason
- expiry
- scope

禁止事項：

- driver 端自行 override
- 沒 reviewer 的 silent release

#### D5. 地圖派遣規劃

Phase 1 最低可行 map board：

- pickup point
- candidate vehicle pins
- driver last known location
- area boundary overlay
- traffic/ETA freshness indicator

Phase 1 不做：

- 地圖拖拉直接改 authority
- 自己算另一套 dispatch truth

### 5.5 工作包 E：司機履約與 proof 閉環

#### E1. Driver task lifecycle

狀態：

- `assigned`
- `accepted`
- `rejected`
- `departed`
- `arrived_pickup`
- `trip_started`
- `trip_in_progress`
- `proof_pending`
- `completed`
- `incident_hold`

關鍵負流程：

- reject without reason
- start before arrived_pickup
- fixed-price modified
- no proof when required
- network loss during completion

#### E2. Completion proof bundle

proof types：

- signoff
- pickup photo
- dropoff photo
- expense proof
- parking receipt
- freeform note

contract rule 需能定義：

- required proof types
- min photo count
- signoff required
- expense proof required
- reviewer required before finance finalization

#### E3. Driver-side offline / retry model

需規劃：

- local pending event queue
- replay idempotency key
- duplicate complete prevention
- proof upload resume
- stale token during retry

### 5.6 工作包 F：客訴 / 事故 / 升級閉環

#### F1. Complaint lane

必須定義：

- complaint categories
- SLA policy
- reopen policy
- required evidence
- closure reasons

負流程：

- complaint misrouted to incident
- missing linked order
- reopened closed case
- SLA breach alert

#### F2. Incident lane

必須定義：

- incident categories
- severity
- owner role
- escalation target
- service recovery actions

負流程：

- no owner assigned
- complaint and incident both created but not linked
- driver incident blocks active trip

#### F3. Cross-lane escalation

必須規劃：

- phone order -> complaint
- incident -> complaint
- dispatch exception -> incident
- compliance gate -> supervisor review

### 5.7 工作包 G：財務 / 對帳 / reconciliation 閉環

#### G1. Billing truth

每筆 order / trip 需能回答：

- payer 是誰
- sponsor 是誰
- invoice owner 是誰
- receipt owner 是誰
- driver net owner 是誰
- reimbursement owner 是誰

#### G2. Channel-aware matrix

至少要分：

- tenant booking
- partner booking
- phone order
- forwarded order

每一種都需定義：

- pricing authority
- settlement source
- invoice behavior
- driver payout behavior
- reimbursement behavior
- reporting attribution

#### G3. Mismatch handling

負流程：

- invoice line missing order
- partner benefit sponsor mismatch
- driver payout wrong due to discount allocation
- forwarder mirror status mismatch with finance snapshot

需要：

- reconciliation issue table
- issue owner
- reopen / resolve flow
- evidence attachment

### 5.8 工作包 H：報表 / 稽核 / artifact / retention 閉環

#### H1. Artifact governance

artifact families：

- invoice artifacts
- statement artifacts
- report files
- filing packages
- call recordings
- recording index exports
- complaint exports

每類都需定義：

- who can request
- mask policy
- signed URL policy
- retention period
- legal hold behavior
- deletion exception

#### H2. Audit model

至少每筆高敏感事件都需記：

- actor
- realm
- resource
- action
- old/new state
- requestId
- reason
- download artifact id

#### H3. Legal hold

需規劃：

- legal hold create
- legal hold release
- blocked deletion behavior
- audit review

### 5.9 工作包 I：整合閉環

#### I1. Tenant API / Webhook

需定義：

- key issue / rotate / revoke
- masked display
- webhook secret versioning
- test delivery
- delivery retries
- dead-letter visibility

負流程：

- secret rotated but old signature still used
- delivery repeatedly failing
- endpoint disabled
- consumer disputes payload timing

#### I2. Partner API

需定義：

- partner auth envelope
- tenant/entry scope resolution
- error contract
- audit behavior
- deactivation behavior

#### I3. Issuer eligibility integration

需規劃：

- verify request / response schema
- timeout policy
- retry policy
- fallback manual review
- sensitive token masking

#### I4. Forwarder adapter

需規劃：

- platform-specific adapter contract
- sync-status replay
- degraded / down states
- reconciliation completion callback

### 5.10 工作包 J：地圖 / 即時位置 / 營運可視化

#### J1. Spatial truth

Phase 1 必須明確：

- location source of truth
- freshness SLA
- driver last-known vs live location distinction
- order pickup location canonical source

#### J2. Operator map board

應提供：

- queue item -> map jump
- pickup / dropoff visualization
- nearby candidate overlay
- stale location indicator
- dispatch action panel

負流程：

- location stale
- no location available
- map service unavailable
- geocode mismatch with saved address

### 5.11 工作包 K：runbook / ownership / release gate 閉環

#### K1. Runbook family

每個主工作流至少要有：

- onboarding runbook
- exception runbook
- rollback runbook
- escalation runbook

必備 runbook 主題：

- driver onboarding / suspend / rebind
- partner onboarding / revoke
- phone order recording exception
- queue exception escalation
- proof shortage review
- reconciliation mismatch handling
- legal hold / artifact request

#### K2. Release gate

任何功能不能只靠 typecheck 過關，至少要有：

- actor path
- positive scenario
- negative scenario
- audit check
- rollback note

### 5.12 工作包 L：驗收 / UAT / negative-path coverage 閉環

#### L1. 驗收矩陣

每一個 scenario family 都要至少有：

- 1 條正流程驗收
- 1 條負流程驗收
- 1 條權限 / audit 驗收

#### L2. 必補 negative-path regression set

除了既有 MVP regression set，必補以下負流程回歸：

- address unresolvable
- wrong tenant scope
- inactive partner entry
- recording pending
- no supply
- driver reject without reason
- pickup not arrived
- proof required
- expense proof required
- insurance expired
- driver cert invalid
- complaint SLA breach
- unauthorized artifact download
- API key plaintext only once
- webhook secret rotation

## 6. 各工作包的交付物

### 6.1 文件交付物

- SA 補充
- SD 細稿
- 畫面規格
- API contract addendum
- runbook
- UAT scenario pack

### 6.2 程式交付物

- backend module changes
- frontend pages / forms / tables / guardrails
- mobile onboarding / proof / session updates
- contracts / DTOs / enums
- tests

### 6.3 營運交付物

- role ownership matrix
- alert routing matrix
- escalation matrix
- reconciliation issue handling matrix
- artifact retention matrix

## 7. 優先順序

### 7.1 P0：Phase 1 不補完就不應宣稱營運閉環

- 身份與入口閉環
- driver master / device binding
- supply registry lifecycle
- tenant onboarding / rollout gate
- partner onboarding / entry lifecycle
- phone order + recording gate
- queue-entry / dispatch / redispatch semantics
- proof / signoff / expense proof gates
- complaint / incident / escalation ownership
- channel-aware reconciliation baseline
- artifact access / retention / legal hold baseline

### 7.2 P1：Phase 1 可營運後應補強

- operator map board
- richer call-center UX
- observability dashboards
- multilingual glossary consistency
- retry / replay / stale-location visualization

### 7.3 P2：後續體驗與規模化增強

- bulk dispatch
- richer optimization
- host-specific product surfaces
- call point / concierge dedicated portal

## 8. 完成定義

一個工作包只有在同時滿足下列條件時才算完成：

1. 角色責任已寫清楚
2. 正流程已寫清楚
3. 負流程已寫清楚
4. 狀態機已寫清楚
5. 畫面 / API / runbook 有對應落點
6. 驗收與 negative coverage 有明確條件
7. authority 沒有分裂
8. audit 與 artifact 規則一致

## 9. 最終結論

如果用一句話總結，現在系統不是缺功能名稱，而是缺：

- 正式身份生命週期
- 正式主檔生命週期
- 正式營運負流程
- 正式責任歸屬
- 正式驗收與 runbook

本文件的目的，就是把這些缺少的內容一次收斂成完整規劃，不再讓後續工作只補半套。

後續所有 Phase 1 補完工作，都應以本文件作為：

- 產品補完清單
- 營運閉環清單
- 負流程補完清單
- release gate 基準
