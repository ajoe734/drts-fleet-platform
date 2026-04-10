# 02. 驗收場景與 Gherkin / UAT 集

## 2.1 使用方式

- 每個 scenario 都可直接轉成 e2e / integration / UAT 測試。
- 若 API / UI / DB 行為與下列預期不一致，以本文件回頭檢查是否規格理解錯誤。
- 若需要新增 scenario，先確認 `00` 與 `01` 沒有衝突。

---

## 2.2 基本格式

每個案例至少要驗證：

1. 主行為結果
2. 狀態改變
3. 是否寫 audit
4. 是否寫 dispatch trace / complaint timeline / billing artifact
5. 是否觸發 notification / webhook

---

## 2.3 交易與派遣

### SC-001 自有 App 即時叫車成功

```gherkin
Feature: Owned standard taxi booking
  Scenario: Passenger creates a realtime standard_taxi order from app
    Given a passenger is authenticated in the passenger app
      And the pickup and dropoff addresses are geocoded successfully
      And the pickup operating area is serviceable
    When the passenger submits an immediate booking request
    Then the system creates an order with order_domain="owned"
      And service_bucket="standard_taxi"
      And dispatch_semantics="realtime"
      And the order status becomes "ready_for_dispatch"
      And an ETA snapshot is stored
      And a dispatch_job is created
      And an audit log is written for order creation
```

**驗收重點**

- 不得落到 `business_dispatch`
- 無 booking window 也能建單
- 必須建立 ETA snapshot

---

### SC-002 自有 Web 叫車但地址不可解析

```gherkin
Scenario: Passenger web booking fails because address cannot be geocoded
  Given a passenger is filling a booking form in web
  When the pickup address cannot be resolved by map service
  Then the system refuses formal order creation
    And returns a validation error "ADDRESS_UNRESOLVABLE"
    And no order is persisted
    And no dispatch_job is created
```

---

### SC-003 電話叫車成功且綁錄音

```gherkin
Scenario: Call center creates a phone booking with recording linkage
  Given an incoming CTI call has started
    And an agent identity announcement has been recorded
    And the call recording is available
  When the agent creates a taxi booking from the call center console
  Then the created order has order_source="phone"
    And call_id is stored
    And recording_id is stored
    And agent_id is stored
    And a dispatch trace entry is appended
    And the order is eligible for realtime dispatch
```

**驗收重點**

- `phone` 來源必須有 `call_id`
- 若是人工建單，`agent_id` 必填
- recording 缺失時不得標記完全合規

---

### SC-004 電話叫車成功但錄音尚未回寫

```gherkin
Scenario: Call center booking is created before recording callback arrives
  Given a CTI call is active
    And recording_id is not yet available
  When the agent submits the booking
  Then the order is created in pending-recording state
    And call_id is stored
    And recording_id is null temporarily
    And the order is marked with compliance flag "recording_pending"
  When the recording-ready callback arrives
  Then the order is updated with the recording_id
    And the compliance flag is cleared
    And an audit trail entry is appended
```

---

### SC-005 標準單完成派車

```gherkin
Scenario: Realtime matcher assigns an eligible vehicle and driver
  Given an owned standard_taxi order is ready_for_dispatch
    And at least one vehicle and driver are eligible
  When the realtime matcher runs
  Then the system creates a dispatch_attempt
    And creates a dispatch_assignment
    And the order status becomes "assigned"
    And the driver receives a task_assigned notification
    And a dispatch_trace_log entry is appended
```

---

### SC-006 派不到車

```gherkin
Scenario: Realtime taxi order fails due to no eligible supply
  Given an owned standard_taxi order is ready_for_dispatch
    And no eligible vehicle exists in the operating area
  When the realtime matcher runs
  Then the dispatch_job status becomes "failed"
    And the order status remains not completed
    And the UI shows not serviceable or delayed state
    And no fake ETA is returned as confirmed arrival time
```

---

### SC-007 派車後改派

```gherkin
Scenario: Assigned taxi order requires redispatch
  Given an owned standard_taxi order is assigned
    And the assigned driver rejects or times out
  When redispatch is triggered
  Then a new dispatch_attempt is appended
    And the old assignment is preserved historically
    And the order status becomes "redispatch_required" then returns to dispatch flow
    And the passenger receives updated ETA if a new candidate is found
```

---

## 2.4 商務派車

### SC-008 企業 Portal 預約企業派車成功

```gherkin
Scenario: Tenant portal creates an enterprise dispatch booking
  Given a tenant user has permission to create bookings
    And the tenant contract allows enterprise dispatch
  When the user submits a booking with passenger, pickup, dropoff and reservation window
  Then the system creates an owned order
    And service_bucket="business_dispatch"
    And business_dispatch_subtype="enterprise_dispatch"
    And dispatch_semantics="reservation"
    And a booking record is created
    And the order enters preassignment flow
```

---

### SC-009 信用卡機場接送預約成功

```gherkin
Scenario: Card benefit partner creates an airport transfer booking
  Given a card benefit partner is authenticated by API
  When the partner submits a booking with benefit reference, passenger, airport direction and terminal
  Then the system creates an owned order
    And service_bucket="business_dispatch"
    And business_dispatch_subtype="credit_card_airport_transfer"
    And the reservation scheduler creates a hold request
    And proof requirements are loaded from contract rules
```

---

### SC-010 機場接送缺少航班號（接機）

```gherkin
Scenario: Airport pickup is rejected when flight number is missing
  Given a partner submits an airport pickup booking
  When the booking has direction="pickup" and no flight number
  Then the system returns "FLIGHT_NO_REQUIRED"
    And no formal order is created
```

---

### SC-011 企業派車已過修改截止不可改

```gherkin
Scenario: Enterprise dispatch cannot be modified after modifiable_until
  Given an enterprise dispatch booking exists
    And current time is after modifiable_until
  When a tenant user attempts to change pickup time
  Then the system returns "ORDER_NOT_MODIFIABLE"
    And the booking remains unchanged
    And the attempted action is audited
```

---

### SC-012 商務預派失敗轉人工

```gherkin
Scenario: Reservation scheduler escalates to manual intervention
  Given a business_dispatch booking is within dispatch confirmation window
    And no eligible reserved supply can be secured
  When the reservation scheduler exhausts automatic attempts
  Then the order enters exception_hold or redispatch queue
    And an ops notification is created
    And tenant SLA notification is sent if configured
```

---

### SC-013 企業派車簽收必填

```gherkin
Scenario: Enterprise dispatch cannot complete without signoff when signoff is required
  Given an enterprise dispatch trip is in dropoff_arrived state
    And the contract requires signoff
  When the driver submits completion without signoff
  Then the system rejects completion with "PROOF_REQUIRED"
    And trip status remains proof_pending
```

---

### SC-014 機場接送停車費憑證必填

```gherkin
Scenario: Airport transfer completion requires expense proof when contract says so
  Given a credit card airport transfer trip is ready to close
    And contract_rule.expense_proof_required=true
  When the driver tries to complete the trip without expense proof
  Then the system returns "EXPENSE_PROOF_REQUIRED"
    And the trip remains proof_pending
```

---

## 2.5 Forwarder

### SC-015 第三方單廣播成功並由平台確認

```gherkin
Scenario: Forwarded order is accepted and confirmed by external platform
  Given an external platform sends an inbound order
    And at least one locally eligible driver exists
  When the forwarder hub broadcasts the order
    And a driver accepts in app
    And the external platform confirms the acceptance
  Then the local forwarded order status becomes "confirmed_by_platform"
    And no owned dispatch_assignment is created
    And lifecycle sync continues from external platform
```

---

### SC-016 第三方單 lost race

```gherkin
Scenario: Driver accepts a forwarded order but loses the race externally
  Given a forwarded order is broadcasted
  When a local driver accepts
    And the external platform responds with lost_race
  Then the local status becomes "lost_race"
    And the driver task is closed without owned trip creation
    And the external authoritative result is preserved
```

---

### SC-017 第三方平台取消單

```gherkin
Scenario: External platform cancels a forwarded order after local mirror exists
  Given a forwarded order mirror exists locally
  When the external platform sends a cancellation callback
  Then the local order status becomes "cancelled_by_platform"
    And no owned cancellation policy is applied
    And cancellation is visible to the driver if the task was active
```

---

## 2.6 司機任務與收尾

### SC-018 司機接受任務

```gherkin
Scenario: Driver accepts an assigned owned task in time
  Given a driver has received a task_assigned event
  When the driver accepts before the timeout
  Then the assignment status becomes accepted
    And the order status becomes driver_accepted
    And acceptance time is stored
```

---

### SC-019 司機拒單必填原因

```gherkin
Scenario: Driver rejects a task and must provide a reason
  Given a task is in pending acceptance state
  When the driver chooses reject
  Then the app must require a reject reason
    And the backend stores the reason with the attempt outcome
```

---

### SC-020 未到上車點不得開始載客

```gherkin
Scenario: Driver cannot start trip before arrived_pickup
  Given a driver has departed for pickup
  When the driver submits start without arrived_pickup
  Then the backend returns "PICKUP_NOT_ARRIVED"
    And trip status remains not started
```

---

### SC-021 固定價任務不可改價

```gherkin
Scenario: Fixed-price business trip cannot alter fare
  Given a trip is marked fixed_price=true
  When the driver submits a completion payload with modified fare
  Then the backend returns "FIXED_PRICE_IMMUTABLE"
    And only allowed proof fields are accepted
```

---

### SC-022 收尾要求最少一張照片

```gherkin
Scenario: Completion requires at least one photo when contract says so
  Given a trip has min_photo_count=1
  When the driver submits completion without any photo
  Then the backend returns "MIN_PHOTO_COUNT_NOT_MET"
    And proof status remains pending
```

---

## 2.7 合規主檔與資格

### SC-023 車輛 onboarding 未完成排他審核不可上線

```gherkin
Scenario: Vehicle cannot be dispatchable before exclusivity review approval
  Given a vehicle record exists
    And exclusivity review is pending
  When ops tries to set dispatchable_flag=true
  Then the system rejects the action
    And the vehicle remains not dispatchable
```

---

### SC-024 保單到期自動停派

```gherkin
Scenario: Vehicle becomes ineligible when insurance expires
  Given a vehicle is active and dispatchable
  When the associated insurance policy reaches expiry
  Then the system marks the vehicle as not dispatchable
    And future dispatch queries exclude the vehicle
    And an alert is generated for ops/compliance
```

---

### SC-025 駕照過期司機不得上線

```gherkin
Scenario: Driver cannot enter available state if required licenses are expired
  Given a driver has an expired occupational license or registration
  When the driver attempts clock_in
  Then the backend returns "DRIVER_CERT_INVALID"
    And driver_work_state does not become available
```

---

### SC-026 單車單派遣終止後需去品牌

```gherkin
Scenario: Vehicle offboarding creates debranding task
  Given an active vehicle contract is terminated
  When the vehicle offboarding flow starts
  Then the vehicle becomes not dispatchable
    And a debranding task is created
    And the case remains open until debranding is closed
```

---

## 2.8 申訴與客服

### SC-027 申訴專線建立正式 complaint case

```gherkin
Scenario: Complaint hotline creates a complaint case instead of incident
  Given a complaint call is received
  When an agent records a fare dispute complaint
  Then the system creates a complaint_case with a case number
    And links it to the related call and order if available
    And sets SLA according to complaint category
    And does not replace it with incident-only handling
```

---

### SC-028 申訴 reopen

```gherkin
Scenario: Closed complaint can be reopened with history preserved
  Given a complaint case has status closed
  When a specialist reopens the case with justification
  Then the case status becomes reopened
    And the original case number is retained
    And the reopen action is written to the complaint timeline
```

---

### SC-029 SLA breach 告警

```gherkin
Scenario: Complaint SLA breach generates alert without overwriting main state
  Given a complaint case is under investigation
    And its SLA due time has passed
  When the SLA monitor job runs
  Then the case is marked with sla_breach flag
    And an alert is sent
    And the main case status remains unchanged
```

---

## 2.9 財務、對帳、輸出

### SC-030 租戶發票產生

```gherkin
Scenario: Tenant monthly invoice is generated for eligible trips
  Given a tenant billing period has ended
  When the billing job runs
  Then the system creates a tenant invoice
    And invoice lines reference eligible orders/trips
    And the invoice artifact is downloadable
```

---

### SC-031 司機對帳單產生

```gherkin
Scenario: Driver statement is generated from completed eligible trips
  Given a billing period has ended
    And the driver fee plan version is active
  When the driver statement job runs
  Then the system creates one driver statement per driver
    And includes gross earning, service fee, subsidy and net amount
    And the statement is visible in driver app
```

---

### SC-032 平台補差不轉嫁司機

```gherkin
Scenario: Platform-funded discount generates reimbursement instead of driver deduction
  Given an owned trip includes a discount funded by platform policy
  When the settlement job runs
  Then the discount amount is not deducted from driver net earning
    And a reimbursement item is generated if required by plan
```

---

### SC-033 月報輸出包生成

```gherkin
Scenario: Regulatory monthly filing package is generated successfully
  Given the month-end snapshot job is scheduled
  When the filing generator runs successfully
  Then the package includes vehicle roster, driver roster, contract roster, insurance roster and statistics
    And a package manifest is generated
    And the package is retained as an immutable artifact
```

---

### SC-034 監理輸出需含錄音索引

```gherkin
Scenario: Dispatch regulatory export includes recording references for phone bookings
  Given phone-origin orders exist in the selected period
  When a dispatch and recording index export is requested
  Then each export row contains order number, call_id and recording_id if available
    And missing recordings are explicitly flagged
```

---

## 2.10 權限與審計

### SC-035 租戶管理員不可看平台級價格模板

```gherkin
Scenario: Tenant admin cannot access platform pricing engine
  Given a tenant admin is authenticated
  When the user navigates to pricing engine resources
  Then the system returns forbidden
    And the access attempt is optionally audited
```

---

### SC-036 司機只能看自己的收益

```gherkin
Scenario: Driver earnings endpoint is self-scoped
  Given a driver is authenticated
  When the driver requests earnings data
  Then only the authenticated driver's statements and earnings are returned
    And no cross-driver data is visible
```

---

### SC-037 高敏感設定需 audit

```gherkin
Scenario: Publishing a public info version is audited immutably
  Given a compliance user publishes a new public_info_version
  When the publish action completes
  Then an immutable audit log entry is created
    And the actor, timestamp, old version and new version are recorded
```

---

### SC-038 API Key 只顯示一次完整值

```gherkin
Scenario: Tenant API key plaintext is shown only once
  Given a tenant technical admin creates a new API key
  When the key is first issued
  Then the full plaintext key is returned once
    And subsequent fetches only show a masked suffix
```

---

### SC-039 Webhook secret 輪替後投遞簽章改用新 secret

```gherkin
Scenario: Tenant webhook secret rotation changes signature source
  Given a tenant webhook endpoint exists
  When the tenant rotates the webhook secret
  Then new webhook deliveries are signed with the new secret
    And prior delivery logs remain historically linked to old secret version metadata
```

---

### SC-040 錄音或匯出下載都需權限與留痕

```gherkin
Scenario: Sensitive artifact download is permissioned and audited
  Given a user requests a call recording or regulatory export artifact
  When the system authorizes the request
  Then a time-limited download URL is issued
    And a download audit entry is recorded
  But when the user lacks permission
  Then the system returns forbidden and does not issue a URL
```

---

## 2.11 最小回歸套件（MVP Regression Set）

若開發時程有限，至少要自動化以下 12 條：

- SC-001
- SC-003
- SC-005
- SC-008
- SC-010
- SC-013
- SC-015
- SC-020
- SC-023
- SC-024
- SC-027
- SC-033
