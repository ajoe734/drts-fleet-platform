# Phase 1 服務契約文件（Service Contracts）v1.0

## 1. 文件目的

本文件承接：

- Phase 1 正式系統分析文件（SA）
- Phase 1 產品需求文件（PRD）
- Phase 1 系統設計文件（SD）

本文件目的為把 SD 中的 domain / service 邊界，進一步收斂成工程、測試、整合、資安、資料與營運團隊可以共同使用的**服務契約**。

本文件只定義：

1. service 邊界
2. source of truth
3. command / query / event 契約
4. 權限與 idempotency 規則
5. 失敗邊界與補償規則
6. 外部整合契約

本文件不定義：

- DB DDL 細節
- UI 細節
- 內部 class / package 結構
- Infra 部署參數

---

## 2. 整體原則

### 2.1 Canonical IDs

平台統一使用以下 canonical identifier：

- tenant_id
- partner_id
- site_id
- call_point_id
- passenger_id
- vehicle_id
- driver_id
- order_id
- booking_id
- dispatch_job_id
- attempt_id
- assignment_id
- trip_id
- call_id
- case_no
- invoice_id
- statement_id
- package_id

### 2.2 時間與時區

- 系統內部全部使用 UTC 儲存。
- UI 顯示依租戶 / 使用者 locale 轉換。
- 所有 API date-time 欄位皆使用 ISO-8601 / RFC3339。

### 2.3 服務呼叫模式

- 查詢型：同步 HTTP API
- 指令型：同步 HTTP API + 事件回寫
- 背景型：job API + polling / webhook
- 高頻即時：WebSocket / server push（driver 任務、dispatch 看板、通知）

### 2.4 Idempotency

以下建立型指令需支援 `Idempotency-Key`：

- Create passenger order
- Create tenant booking
- Create call-center order
- Create complaint case
- Create report job
- Generate filing package
- Driver payout request
- Webhook test delivery
- Dispatch assign / redispatch

### 2.5 Source of truth 原則

- 租戶與平台治理：PlatformCo Admin / Tenant service
- 車輛 / 駕駛 / 契約 / 保險 / 排他：Regulatory Registry
- owned 訂單：Order Service
- 派單執行：Dispatch Service
- forwarded 訂單原生狀態：Forwarder Service + 外部平台 authoritative state
- 話務錄音索引：Callcenter Service
- 申訴案件：Complaint Service
- 對租戶 / 對司機帳務：Billing Service
- 監理輸出：Reporting Service
- 審計：Audit Service

---

## 3. Service 清單與責任

## 3.1 Identity Service

### 責任

- 後台與 App 身分驗證
- JWT 發行與 refresh
- MFA / OTP
- session / device binding
- admin realm / tenant realm / driver realm

### 不負責

- 業務角色資料內容
- 授權資源內容
- 租戶資料主檔

### 主要 commands

- login
- verify_mfa
- refresh_token
- logout
- register_device_token

### 主要 queries

- get_current_principal
- get_current_scopes

### 發布事件

- auth.login.succeeded
- auth.login.failed
- auth.mfa.challenged
- auth.device.registered

### Stage 1.5 IAM Contract Supplement

- Canonical Stage 1.5 IAM wire contracts live in `packages/contracts/src/iam-contracts.ts` and `openapi/iam-stage15-contracts-v1.yaml`.
- Public auth/session exchange failures must use anti-enumeration codes and must not reveal whether a membership, invitation, or partner credential exists.
- Mutation contracts for account, role, approval, access-review, break-glass, device, and credential governance require canonical reason and optimistic-concurrency metadata.

---

## 3.2 Tenant & Partner Service

### 責任

- tenant / partner / site / call point / passenger / address book 主資料
- tenant domain users / roles
- tenant API keys / webhooks / notifications / SLA profile
- tenant billing profile

### Source of truth

- tenant metadata
- passenger directory
- address book
- webhook endpoint metadata
- tenant user-role mapping

### 不負責

- 平台級 admin user
- price engine final calculation
- order lifecycle

### 主要 commands

- create_tenant
- update_tenant
- suspend_tenant
- create_tenant_user
- update_tenant_role
- create_passenger
- upsert_address
- create_webhook_endpoint
- rotate_api_key
- update_billing_profile
- update_notification_subscription
- update_sla_profile

### 主要 queries

- list_tenants
- get_tenant_home
- list_passengers
- list_addresses
- list_webhook_deliveries
- list_tenant_audit

### 發布事件

- tenant.created
- tenant.updated
- tenant.suspended
- tenant.user.invited
- tenant.user.role_changed
- tenant.passenger.upserted
- tenant.address.upserted
- tenant.webhook.updated
- tenant.billing_profile.updated
- tenant.sla.updated

---

## 3.3 Regulatory Registry Service

### 責任

- vehicle / driver / contract / insurance / exclusivity / placard / brand profile 主資料
- 證照、保單、契約效期
- dispatchable eligibility 前置審核
- vehicle onboarding / offboarding

### Source of truth

- 車輛合規主檔
- 駕駛合規主檔
- 委託契約
- 旅客責任險
- 單車單派遣排他狀態
- 車身與椅背揭示版本

### 不負責

- 派單邏輯
- ETA
- trip 結果
- 申訴處理結果

### 主要 commands

- create_vehicle
- update_vehicle
- submit_vehicle_review
- approve_vehicle_onboarding
- terminate_vehicle
- create_driver
- update_driver_reg_profile
- add_training_record
- create_contract
- activate_contract
- create_insurance_policy
- activate_insurance_policy
- submit_exclusivity_review
- approve_exclusivity
- generate_placard_version

### 主要 queries

- list_vehicles
- get_vehicle
- list_drivers
- get_driver
- list_contracts
- list_policies
- list_expiring_certificates
- list_expiring_policies

### 發布事件

- vehicle.created
- vehicle.review_submitted
- vehicle.activated
- vehicle.suspended
- vehicle.terminated
- driver.updated
- certificate.expiring
- insurance.expiring
- vehicle.exclusivity.approved
- placard.generated

---

## 3.4 Product & Rule Service

### 責任

- external service mapping
- service bucket mapping
- contract rule / SLA / pricing template / split template / qualification profile / fallback policy

### Source of truth

- 商品映射
- 可派資格模板
- SLA / pricing / split / fallback 版本

### 不負責

- 實際計價結果
- owned 訂單主表
- dispatch runtime status

### 主要 commands

- create_service_mapping
- publish_sla_template
- publish_pricing_template
- publish_split_template
- publish_qualification_profile
- publish_fallback_policy

### 主要 queries

- resolve_service_mapping
- get_effective_rule_bundle
- preview_pricing_template
- list_templates

### 發布事件

- service_mapping.published
- sla_template.published
- pricing_template.published
- split_template.published
- qualification_profile.published
- fallback_policy.published

---

## 3.5 Order Service

### 責任

- owned 訂單建立與生命周期
- booking lifecycle
- passenger quote snapshot
- classification result persistence
- order notes / attachments metadata

### Source of truth

- owned order 主表
- booking 主表
- quote snapshot
- owned order 狀態機

### 不負責

- dispatch assignment
- driver task acceptance
- call recording file 本體
- complaint SLA

### 主要 commands

- create_passenger_order
- create_tenant_booking
- update_booking
- cancel_owned_order
- classify_order
- attach_order_note
- request_redispatch
- mark_exception_hold

### 主要 queries

- get_order
- list_orders
- get_booking
- list_bookings
- get_quote

### 發布事件

- order.created
- order.classified
- booking.created
- booking.updated
- order.cancelled
- order.redispatch_requested
- order.exception_hold

### 關鍵規則

- `owned` 訂單只能由 Order Service 建立與轉態。
- `forwarded` 單不可寫入 owned 狀態機。
- `business_dispatch` 一定要關聯 booking。

---

## 3.6 Dispatch Service

### 責任

- service area eligibility
- ETA calculation
- realtime matcher
- reservation scheduler
- queue / rank
- dispatch job / attempt / assignment
- dispatch trace

### Source of truth

- dispatch_job
- dispatch_attempt
- dispatch_assignment
- eta_snapshot
- dispatch_trace_log

### 不負責

- order 基本資料
- driver profile 主檔
- 外部平台 authoritative 接單結果
- 最終 billing

### 主要 commands

- request_dispatch
- assign_vehicle
- redispatch
- create_reservation_hold
- release_reservation_hold
- queue_check_in
- queue_check_out
- write_dispatch_trace

### 主要 queries

- get_pending_tasks
- get_candidate_vehicles
- get_eta
- get_dispatch_job
- get_dispatch_attempts
- get_dispatch_board

### 發布事件

- dispatch.requested
- dispatch.eta.calculated
- dispatch.assigned
- dispatch.failed
- dispatch.redispatched
- reservation.hold.created
- reservation.hold.released
- queue.entry.created
- dispatch.trace.written

### 關鍵規則

- 禁止指派 `offline / maintenance / suspended / non-dispatchable` 車。
- 不可覆蓋舊 attempt / assignment。
- manual override 也必須留下 dispatch trace。

---

## 3.7 Forwarder Service

### 責任

- 第三方平台 adapter 管理
- inbound forwarded orders
- driver eligibility relay
- broadcast / accept relay
- native status sync
- reconciliation mirror

### Source of truth

- forwarded order 鏡像資料
- adapter 狀態
- sync 狀態
- reconciliation job

### 不負責

- 外部平台最終 authoritative 狀態
- own dispatch assignment

### 主要 commands

- ingest_external_order
- broadcast_forwarded_order
- relay_driver_accept
- sync_native_status
- create_reconciliation_job

### 主要 queries

- list_external_orders
- get_adapter_health
- get_sync_errors
- get_reconciliation_result

### 發布事件

- forwarder.order.received
- forwarder.order.broadcasted
- forwarder.order.accept_pending
- forwarder.order.confirmed_by_platform
- forwarder.order.sync_failed
- forwarder.reconciliation.completed

### 關鍵規則

- `accept_pending` 不等於平台已確認。
- `confirmed_by_platform` 才能生成司機端正式可履約狀態。
- 外部平台斷線不得把 forwarded 單降格寫成 owned 單。

---

## 3.8 Driver Task Service

### 責任

- Driver App 任務清單
- accept / reject / depart / arrived / start / complete
- handover / proof metadata
- shift & attendance
- driver earnings read model
- driver payout request

### Source of truth

- driver task state
- driver availability state
- shift clock records
- proof bundle metadata
- driver earnings read model（讀模型）

### 不負責

- 合規主檔真值
- tenant billing 真值
- call session
- complaint case

### 主要 commands

- accept_task
- reject_task
- depart_to_pickup
- arrived_pickup
- start_trip
- submit_proof
- complete_trip
- clock_in
- clock_out
- request_driver_payout

### 主要 queries

- list_driver_tasks
- get_driver_task_detail
- get_driver_shifts
- get_driver_earnings
- get_driver_profile
- list_lessons

### 發布事件

- driver.task.accepted
- driver.task.rejected
- driver.departed
- driver.arrived_pickup
- trip.started
- proof.submitted
- trip.completed
- driver.clocked_in
- driver.clocked_out
- driver.payout.requested

### 關鍵規則

- 未到上車點不得 start trip。
- proof_required 的商務單未補 proof 不得 complete。
- 司機若被 Regulatory suspend，Driver Task Service 必須拒絕 clock-in。

---

## 3.9 Callcenter Service

### 責任

- CTI webhook intake
- call session metadata
- recording index
- callback queue
- agent identity announcement log

### Source of truth

- call_session
- call_recording_index
- callback_task

### 不負責

- complaint resolution
- order state 轉態真值
- recording binary 本體（由 object store / CTI provider 管）

### 主要 commands

- open_call_session
- close_call_session
- attach_recording
- create_order_from_call
- create_case_from_call
- create_callback_task

### 主要 queries

- get_call
- get_recording_index
- list_calls
- list_callbacks

### 發布事件

- call.started
- call.ended
- call.recording.ready
- call.linked_to_order
- call.linked_to_case
- callback.created

### 關鍵規則

- 每通電話最多一個 active call session。
- 建單成功後必須能回查 recording_id。
- booking 類來電若缺錄音索引，需標示 `recording_missing`。

---

## 3.10 Complaint Service

### 責任

- complaint case
- dispute workflow
- SLA timer
- timeline / notes / resolution
- export-ready complaint detail

### Source of truth

- complaint_case
- complaint_timeline
- resolution log

### 不負責

- 原始錄音索引真值
- order 主狀態
- financial posting

### 主要 commands

- create_case
- assign_case
- add_case_note
- request_external_reply
- propose_resolution
- resolve_case
- reopen_case
- close_case

### 主要 queries

- list_cases
- get_case
- get_case_timeline
- get_case_export_view

### 發布事件

- complaint.case.created
- complaint.case.assigned
- complaint.case.sla_breached
- complaint.case.resolved
- complaint.case.closed
- complaint.case.reopened

### 關鍵規則

- case_no 為唯一不可變。
- 結案必須有 resolution_code 與 closing note。
- SLA breach 只加標記，不覆蓋主狀態。

---

## 3.11 Billing & Settlement Service

### 責任

- passenger receipt
- tenant invoice
- driver fee plan
- driver statement
- reimbursement batch
- remittance proof
- settlement snapshot

### Source of truth

- invoice / statement / reimbursement 真值
- fee plan 版本
- remittance proof index

### 不負責

- 車輛 / 司機 / 合約主檔
- 原始 trip 狀態
- complaint 審核邏輯

### 主要 commands

- issue_passenger_receipt
- generate_tenant_invoice
- publish_driver_fee_plan
- generate_driver_statement
- approve_reimbursement_batch
- mark_reimbursement_paid

### 主要 queries

- get_invoice
- list_invoices
- get_driver_statement
- list_driver_statements
- get_reimbursement_batch

### 發布事件

- receipt.issued
- tenant.invoice.generated
- tenant.invoice.paid
- driver.fee_plan.published
- driver.statement.generated
- driver.reimbursement.approved
- driver.reimbursement.paid

### 關鍵規則

- fee plan / pricing version 一旦 published 不可原地修改。
- 補差與扣款必須帶 version snapshot。
- driver wallet 僅為讀模型，不作真值帳本。

---

## 3.12 Reporting & Filing Service

### 責任

- ad hoc reports
- scheduled reports
- regulatory reports
- filing package
- artifact packaging

### Source of truth

- report_job
- report_artifact
- filing_package
- package manifest

### 不負責

- 原始交易真值
- audit 真值

### 主要 commands

- create_report_job
- schedule_report_job
- generate_regulatory_report
- generate_filing_package

### 主要 queries

- get_report_job
- list_report_jobs
- get_package
- list_packages

### 發布事件

- report.job.created
- report.job.completed
- report.job.failed
- filing.package.generated
- filing.package.failed

### 關鍵規則

- 大報表只能背景 job。
- artifact URL 必須為受控簽章下載。
- package 一旦完成，manifest 與 hash 不可變。

---

## 3.13 Audit & Notification Service

### 責任

- immutable audit append
- notification fan-out
- webhook delivery
- delivery retry
- maintenance / notice push

### Source of truth

- audit_log
- notification log
- webhook delivery log

### 不負責

- 業務資料真值
- SLA 真值

### 主要 commands

- append_audit_log
- enqueue_notification
- deliver_webhook
- retry_webhook
- publish_notice

### 主要 queries

- list_audit_logs
- list_notifications
- list_webhook_deliveries

### 發布事件

- audit.logged
- notification.sent
- notification.failed
- webhook.delivered
- webhook.delivery_failed
- notice.published

### 關鍵規則

- audit log append-only，不可 update/delete。
- webhook 失敗需遵循 retry policy。
- 高敏感操作必須寫審批人與前後值摘要。

---

## 4. 主要同步契約（Commands / Queries）

## 4.1 Passenger order 建立

### API owner

Order Service

### Request

- idempotency_key
- pickup / dropoff
- scheduled_at(optional)
- passenger contact
- service hints
- payment method
- notes

### Pre-check

1. 地址可解析
2. service area 可服務
3. 最短提前時間符合
4. passenger channel auth 合法

### Response

- order_id
- order_no
- order_domain=owned
- service_bucket
- dispatch_semantics
- eta snapshot (若可即算)
- current_status=created

### Errors

- ADDRESS_UNRESOLVED
- AREA_NOT_SERVICEABLE
- TOO_SOON_TO_BOOK
- AUTH_FORBIDDEN
- DUPLICATE_IDEMPOTENCY_KEY

---

## 4.2 Tenant booking 建立

### API owner

Order Service + Tenant Service

### Required business payload

- tenant_id
- booking_type
- scheduled window
- passenger
- cost center
- product subtype
- contact / onsite contact
- webhook opt-in(optional)

### Business rules

- enterprise / credit-card partner 合約必須有效
- `business_dispatch` 必須進 booking flow
- recurring booking 需 recurrence rule

---

## 4.3 Dispatch assign

### API owner

Dispatch Service

### Input

- dispatch_job_id
- selected_vehicle_id
- selected_driver_id(optional)
- manual_override_reason(optional)

### Preconditions

- vehicle dispatchable
- driver active and available
- no scheduling conflict
- operating area compatible
- insurance / certificate valid
- reservation hold not violated

### Side effects

- create dispatch_assignment
- emit dispatch.assigned
- create driver task projection
- write dispatch trace

---

## 4.4 Driver task accept

### API owner

Driver Task Service

### Input

- task_id
- driver_id
- accepted_at
- device_id

### Preconditions

- within accept window
- driver bound to current session / device
- task status in offerable state
- driver not suspended

### Side effects

- emit driver.task.accepted
- update owned order state to driver_accepted OR forwarded projection state to confirmed local

---

## 4.5 Call-center order create

### API owner

Callcenter Service -> Order Service orchestration

### Input

- call_id
- agent_id
- caller_phone
- booking payload

### Preconditions

- active call session exists
- agent authenticated
- call_type allows booking

### Side effects

- create owned order
- link call session to order
- later attach recording index
- write audit log

---

## 4.6 Complaint resolve

### API owner

Complaint Service

### Input

- case_no
- resolution_code
- resolution_note
- assignee_id
- optional refund/reimbursement request reference

### Preconditions

- case in resolvable state
- assignee authorized

### Side effects

- change case state
- emit complaint.case.resolved
- if compensation needed, open finance action rather than direct posting

---

## 4.7 Filing package generate

### API owner

Reporting Service

### Input

- package_type
- scope
- period
- requested_by

### Preconditions

- requester has compliance scope
- all required source datasets available

### Outputs

- package_id
- status=queued / running / completed
- artifact_pdf_url
- artifact_zip_url
- manifest checksum

---

## 5. 主要非同步契約（Events）

## 5.1 Event Envelope（統一格式）

所有 domain event 統一使用以下 envelope：

```json
{
  "eventId": "uuid",
  "eventType": "order.created",
  "eventVersion": 1,
  "occurredAt": "2025-04-10T00:00:00Z",
  "producer": "order-service",
  "tenantId": "uuid-or-null",
  "correlationId": "uuid",
  "causationId": "uuid",
  "subjectId": "uuid-or-business-id",
  "data": {}
}
```

### 強制規則

- `eventId` 唯一
- `eventVersion` 單調遞增
- `occurredAt` 為 producer time
- `correlationId` 貫穿同一流程
- PII 不進 event bus；若必需，僅傳 reference id

---

## 5.2 Core Event Topics

**Status: target contract, not implemented in Phase 1.** Decision:
`docs/01-decisions/SD-DP-20260817-009-domain-event-contract-and-write-authority.md` (`GAP-CONF-02`).
The topics below describe the correct design for an architecture of thirteen independently deployed
services communicating by domain event. Order, Dispatch, and Driver Task are implemented inside one
process (`owned-mobility.service.ts`), where a direct typed call inside one database transaction is
used instead. No event bus, outbox table, or publish/subscribe mechanism exists anywhere in Phase 1.
Do not treat this list as delivered, and do not add a partial implementation of it — see the
decision record for why a subset is explicitly rejected. Treat "Phase 1 Implemented Mechanisms"
below as the live contract. The per-service `發布事件` lists in section 3 (3.5, 3.6, 3.8, etc.)
describe the same unimplemented target and carry the same status.

### Order Domain

- order.created
- order.classified
- order.cancelled
- order.redispatch_requested

### Booking Domain

- booking.created
- booking.updated
- booking.cancelled

### Dispatch Domain

- dispatch.requested
- dispatch.eta.calculated
- dispatch.assigned
- dispatch.failed
- dispatch.redispatched
- reservation.hold.created
- queue.entry.created

### Driver Domain

- driver.task.accepted
- driver.task.rejected
- driver.departed
- driver.arrived_pickup
- trip.started
- proof.submitted
- trip.completed

### Callcenter Domain

- call.started
- call.ended
- call.recording.ready
- call.linked_to_order
- call.linked_to_case

### Complaint Domain

- complaint.case.created
- complaint.case.assigned
- complaint.case.sla_breached
- complaint.case.closed

### Billing Domain

- receipt.issued
- invoice.issued (renamed from `tenant.invoice.generated`; aligned to the implemented Phase 1
  webhook name, see "Phase 1 Implemented Mechanisms" below)
- driver.statement.generated
- driver.reimbursement.approved

### Regulatory Domain

- vehicle.activated
- insurance.expiring
- certificate.expiring
- vehicle.exclusivity.approved

### Reporting Domain

- report.job.completed
- filing.package.generated

---

### Phase 1 Implemented Mechanisms（Phase 1 實際契約）

Three narrower mechanisms exist in place of the target topic list above. They are Phase 1's real
asynchronous/notification contract:

| Mechanism | 實際 topic 名稱 | 對象 | 實作位置 |
| --- | --- | --- | --- |
| Tenant webhook | `booking.created`, `booking.updated`, `dispatch.assigned`, `invoice.issued` | tenant 系統 | `tenant-partner.service.ts:526-530` |
| Dispatch trace log | `dispatch.assigned`（trace label，非 pub/sub topic） | audit、監理單位 | `owned-mobility.service.ts:7138` |
| Audit log | 各模組 action name | audit | `audit-notification` 模組 |

### 強制規則（Phase 1 實際機制）

- 上述三個機制彼此獨立，沒有共用的 event envelope、event bus 或 outbox；不得假設任一機制的訊息可被
  另一機制的消費者讀到。
- 新增一個 topic 進任何一個機制的清單，等同於擴大該機制的契約，必須回到
  `SD-DP-20260817-009` 或後續同等決策記錄，不得逕行在程式碼中新增。

---

## 6. 故障邊界與補償設計

**機制模型：** 依據 `SD-DP-20260817-009`，Phase 1 沒有 event bus 或 outbox，以下補償設計一律以
「同步呼叫 + 資料庫狀態欄位 + 排程 reconciliation job」表達，不描述任何被消費的事件或訊息佇列。
Order、Dispatch、Driver Task 三者在同一個 `owned-mobility` 模組、同一個 process 內，彼此的呼叫是
直接的 in-process typed call；Callcenter、Complaint、Billing、Forwarder 是各自獨立的模組，彼此與
`owned-mobility` 之間仍是同步 API 呼叫加上應用層重試，不是事件消費。

## 6.1 Order created 但 dispatch request 失敗

### 結果

- order 保持 `ready_for_dispatch`
- dispatch request 是 `owned-mobility` 模組內的直接呼叫（非跨程序事件）；失敗後由應用層重試，
  不經過任何訊息佇列
- 告警 Ops console
- 不回滾 order

## 6.2 call ended 但 recording index 未回來

### 結果

- call_session 保持 closed
- linked_order 可以成立
- 標記 `recording_missing=true`
- 由排程 reconciliation job 直接呼叫 recording index 服務補做索引 / 告警，不阻斷訂單流程；job 本身
  不是任何 topic 的消費者

## 6.3 dispatch assigned 後 driver app 未收到

### 補償

- task delivery 由 driver app 對後端做 push + polling，兩者皆為同步請求，不是事件訂閱
- 超過門檻則後端直接呼叫 re-offer / redispatch（同一個 `owned-mobility` 模組內的呼叫）

## 6.4 complaint resolved 但 reimbursement posting 失敗

### 補償

- complaint 狀態可 resolved
- finance action 在 `billing-settlement` 模組內保持 `pending` 狀態欄位
- 由排程 reconciliation job 直接呼叫 `billing-settlement` 的 finance action API 重試，不透過任何
  補償佇列或事件消費者
- case timeline 加入 finance pending note（`complaint` 模組呼叫 timeline API 寫入，非事件訂閱）

## 6.5 external forwarder sync failed

### 補償

- 標記 sync error
- 不覆蓋外部 authoritative status
- 由排程 reconciliation job 直接呼叫 forwarder adapter 重試同步，非事件消費

---

## 7. 權限與操作權威

## 7.1 寫入權威矩陣（摘要）

**Status:** 本表已依 `SD-DP-20260817-009`（`GAP-CONF-07`）對齊實際程式碼模組邊界，取代原先假設
Order / Dispatch / Driver Task 為三個獨立部署服務的版本。契約原文的服務名稱在下表以「原契約服務」
欄位保留，供閱讀 section 3 的服務清單時對照。

| 實體                                         | 寫入權威（實際模組）                                                              | 原契約服務                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------- |
| tenant / partner / site                      | `tenant-partner` 模組                                                              | Tenant & Partner Service（一致）                   |
| vehicle / contract / insurance / exclusivity | `regulatory-registry` 模組                                                         | Regulatory Registry（一致）                        |
| owned order / booking                        | `owned-mobility` 模組                                                              | Order Service（合併，見下方關鍵原則）              |
| dispatch_job / attempt / assignment          | `owned-mobility` 模組（未建立獨立 dispatch 模組）                                  | Dispatch Service（合併，見下方關鍵原則）           |
| driver task state                            | `owned-mobility` 模組（核心狀態機）+ `driver-settings` / `shift-attendance` / `driver-profile` / `driver-sos`（各自關注點） | Driver Task Service（分散於 5 個模組）             |
| forwarded order mirror                       | `forwarder` 模組                                                                   | Forwarder Service（一致）                          |
| call_session / recording index               | `callcenter` 模組                                                                  | Callcenter Service（一致）                         |
| complaint_case                               | `complaint` 模組                                                                   | Complaint Service（一致）                          |
| invoice / statement / reimbursement          | `billing-settlement` 模組                                                          | Billing Service（一致）                            |
| report_job / filing_package                  | `reporting-filing` + `reporting` + `regulatory-reporting` 模組群                   | Reporting Service（一致，多模組）                  |
| audit_log                                    | `audit-notification` 模組                                                          | Audit Service（一致）                              |

### 關鍵原則

- UI 不直接跨域寫資料庫
- 模組 / process 邊界之間只透過 API / event 寫入。`owned-mobility` 模組內部（owned order/booking、
  dispatch_job/attempt/assignment、driver task 核心狀態）彼此不是跨 process 邊界，寫入是同一個資料
  庫交易內的直接呼叫，不經過 API 或 event；此例外僅適用於這三者共享同一模組的期間，若未來拆成獨立
  部署服務，則回到本原則並依 `SD-DP-20260817-009` 的 Option 2 設計 outbox。
- read model 可被多服務消費，但不可反寫 source of truth

---

## 8. 外部整合契約

## 8.1 CTI / SIP Provider

### 進站事件

- incoming call started
- call ended
- recording ready
- agent state changed

### 最低 payload

- provider_call_id
- direction
- caller_phone
- agent_extension
- started_at / ended_at
- recording_url or recording_id
- disposition(optional)

### 系統要求

- callback verify secret
- replay protection
- provider timestamp retention
- recording ready SLA 監控

---

## 8.2 Map / ETA Provider

### 能力

- geocoding
- reverse geocoding
- route matrix
- traffic ETA

### 約束

- geocode 成功才可正式建單
- ETA 需能回傳 request trace id
- provider 降級時，Callcenter 允許人工點位補建，但必標記 manual_geocode

---

## 8.3 Payment / Invoice Provider

### 能力

- card authorization / capture
- settlement file import
- invoice PDF / e-invoice
- remittance batch proof import

### 約束

- credential encrypted at rest
- 任何對帳差異都不能默默 auto-fix
- 需保留 provider reference ids

---

## 8.4 External Forwarder Platforms

### 入站

- new order broadcast
- native status update
- cancellation
- settlement file / API

### 出站

- driver accept
- task progress(optional)
- health ping

### 約束

- per-platform adapter config
- timeout / retry / circuit breaker
- external platform status 保持 authoritative

---

## 9. Phase 2 保留契約

雖然 Phase 1 不啟用 AV runtime，但以下 contract 先保留：

- `vehicle.automation_mode`
- `order.service_bucket=av_pilot`
- `av.eligibility.checked`
- `av.mission.created`
- `av.takeover.created`
- `av.recovery.required`

其設計要求：

- 不影響 Phase 1 現行 owned / forwarded 契約
- 不改變 driver / billing / complaint 基線 contract
- 僅以 extension event 與 extension field 方式接入

---

## 10. 契約評審待確認項（Review Questions & Decision Routing）

以下 5 項契約評審待確認項對應 `PHASE1_OPEN_QUESTIONS.md` 中的 Q-001 至 Q-005。各項皆已指派負責 Owner 與決策途徑（Decision Route），在正式決策產出前依暫定預設（Interim Default）推進，不在此任務中擅自結案：

| 編號 / 對應問題 | 待確認項目與暫定預設 | 負責 Owner | 決策途徑（Decision Route） |
| :--- | :--- | :--- | :--- |
| **10.1 (Q-001)** | **`call_session` 與 `order` 關聯基數**<br>- 問題：`call_session` 是否允許 1:n 關聯（同一通電話建立多單），或 Phase 1 流程維持一通電話建立一筆主訂單？<br>- 暫定預設：後端資料模型保持可擴充（開放 1:n 關聯），但 Phase 1 規劃與 UI 流程以一通電話建立一筆主訂單為基礎。 | `Codex` (Contracts & Schema) / `Callcenter & Order Service` | **Callcenter / Order 契約評審 RFC**：由 Codex 牽頭、Claude 審查，確認資料庫外鍵關聯設計與 `apps/ops-console-web` 話務派單操作流程之多單支援需求。 |
| **10.2 (Q-002)** | **機場接送航班監控欄位 `flight_ref` 保留**<br>- 問題：機場接送契約是否在 Phase 1 尚未具備航班即時追蹤 runtime 前即保留 `flight_ref` 欄位？<br>- 暫定預設：在契約與 API 範例中保留該欄位作為選填中繼資料（metadata），但 Phase 1 不實作航班監控邏輯。 | `Codex2` (Partner & Airport Transfer) / `Claude2` | **Partner 渠道與機場接送契約評審**：由 Codex2 牽頭、Claude 審查，評估 `CreateBookingDto` 欄位定義與 Phase 2 航班追蹤整合介面銜接規格。 |
| **10.3 (Q-003)** | **司機提領（Driver Payout）模式**<br>- 問題：driver payout 是否僅限對帳單與請款申請（statement & reimbursement request），或 Phase 1 需包含即時錢包餘額與會計帳扣帳流程？<br>- 暫定預設：僅實作對帳單生成與補貼/請款審核流程，暫不建置即時錢包帳本。 | `Codex` (Contracts & Financial Model) / `Billing Service` | **Billing & Settlement 架構決策 RFC**：由 Codex 牽頭、Claude 與財務產品負責人審查，界定 Phase 1 批次請款與 Phase 2 即時錢包帳本之功能邊界。 |
| **10.4 (Q-004)** | **Forwarded 訂單之本地 `trip completed` 狀態投影**<br>- 問題：轉派（forwarded）訂單是否需要強本地 `trip completed` 真值，或僅依賴外部平台鏡像同步投影？<br>- 暫定預設：僅記錄鏡像同步狀態投影（`completed_synced`），以外部平台權威狀態為準。 | `Codex2` (Forwarder Adapter) / `Claude2` | **Forwarder 生命週期與狀態機 RFC**：由 Codex2 / Claude2 牽頭、Claude 審查，結合 `GAP-CONF-04` 決定轉派訂單狀態機與對帳同步機制。 |
| **10.5 (Q-005)** | **報表產物（Report & Filing Artifacts）儲存鎖定層級**<br>- 問題：監理申報與報表產物是否需 storage-level 物件鎖（Object Lock），或不可變 manifest 加上雜湊（hash）保證即已足夠？<br>- 暫定預設：Phase 1 採不可變 manifest 搭配 SHA-256 雜湊與受控存取權限。 | `Gemini` (Infra & Compliance) / `Reporting Service` | **法規儲存與合規架構 RFC**：由 Gemini 牽頭、Claude 審查，評估雲端儲存 Object Lock 政策與資料庫不可變產物清單之合規性需求。 |

