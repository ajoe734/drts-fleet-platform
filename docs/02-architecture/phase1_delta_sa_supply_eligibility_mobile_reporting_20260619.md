# Phase 1 修正系統分析文件（SA）

## 車行供給自主建檔、精確服務資格、Driver App 真機驗證、營運紀錄與半年摘要

**文件版本**：v1.0
**日期**：2026-06-19
**適用對象**：智慧運輸科技股份有限公司 — 計程車客運服務業／派遣車隊 Phase 1
**基準分支**：`ajoe734/drts-fleet-platform` 的 `dev` branch
**適用系統**：

- `drts-fleet-platform`
- Fleet Partner Portal
- Platform Admin
- Ops Console
- Driver App
- Reporting / Filing

**本文件明確不包含**：

- CTI、雲端電話、錄音與客服的正式擴充
- AI 語音客服
- 電話線路、IVR、ACD、客服席次選擇
- 跟系統性的申請書、公司設立、資本額或股數頁的營業設立

CTI 尚未選定供應商，後續另以獨立 SA / SD addendum 處理。本文件不得自行假設任何 CTI provider、webhook 格式或錄音 API。

---

# 0. 文件目的與系統設計裁決

本文件只處理以下四項已確認的系統修正：

1. **車行端供給（司機／車輛／保險／契約）自主提交與平台審核**
2. **精確 Service Product Eligibility 串入實際派車**
3. **Driver App Android／iOS 實機位置與狀態驗證**
4. **每日派遣紀錄與最近半年營運摘要**

這四項不是重新設計整套平台，而是補齊 `dev` 目前仍存在的營運斷點。

本次裁決如下：

- 車行（車隊合作方）是供給資料的**建立與維護者**。
- 智慧運輸科技是供給資料的**審核者、派遣平台與營運資料彙整者**。
- 車行提交的資料在核准前都是 submission，不得直接修改 canonical registry。
- `serviceBucket` 只能作為粗分類，不得再作為派車資格的最終判斷依據。
- 所有 booking、order、dispatch job、candidate、assignment、driver task 都必須保留精確 `serviceProductCode`。
- Driver App 的 emulator / API 測試不能取代 Android 與 iOS 真機驗證。
- 每日派遣紀錄與半年摘要要建立在現有訂單、派遣、任務、位置、客訴資料上，不另外建立第二套統計引擎。
- 現有 `ReportingFilingModule` 受擴充，不另建一套報表平台。

---

# 1. `dev` 分支現狀盤點

## 1.1 已具備的能力

### Fleet Partner

`dev` 已存在：

- Fleet Partner CRUD
- Driver Fleet Affiliation
- Revenue Share Rules
- Fleet Partner Statements
- Fleet Partner Dashboard
- Fleet Partner Drivers
- Fleet Partner Vehicles
- Fleet Partner Trips
- Fleet Partner Quality Metrics
- Fleet Partner Portal UI

現有 Fleet Partner Portal 以 read-heavy 為主，其資料 loader 已明確標示：

- Dashboard、Drivers、Vehicles、Trips、Quality、Statements 有 live endpoint。
- Documents、Training、Cases 尚無 dedicated fleet-partner endpoint。
- 多數 driver / vehicle 文件與訓練樣本仍使用 neutral defaults 或 fixture fallback。
- 目前沒有完整 portal-side write mutation。

### Regulatory Registry

`dev` 已存在：

- Vehicle list
- Vehicle compliance update
- Driver create
- Driver lifecycle / work state
- Driver location heartbeat
- Driver ETA
- Contract create / activate
- Insurance create / activate / expiring query

目前問題不是沒有 registry，而是車行不能從 portal 以受控流程提交，再由平台審核後寫入 registry。

### Service Product / Vehicle Eligibility

`dev` 已存在：

- Service Product list / create / update
- Vehicle Eligibility Matrix list / update
- E2E-013 service-product eligibility scenario

但現有 E2E 結果暴露出一個深層風險：

> 機場接送訂單若只被解析為廣義 `business_dispatch`，可能繞過精確 `credit_card_airport_transfer` 資格限制。

因此需要把精確 product identity 由 intake 一路帶到 assignment。

### Driver App

`dev` 已存在：

- Expo / React Native Driver App
- Android background location permission
- iOS background location mode
- Foreground and background location heartbeat
- 15 秒 heartbeat 節流
- accept / reject / depart / arrived / start / complete
- emulator 10 round verification
- API-side device lifecycle E2E

目前程式已可在 active task 時送出 location heartbeat，但仍有：

- 無 durable offline queue
- unsent heartbeat 在 App 被殺時可能遺失
- location 主要以 active trip 啟動，尚未完整驗證 online / available 狀態的持續定位
- Android 與 iOS 實體裝置證明仍未完成
- iOS force-quit、Android battery optimization、弱網與網路切換尚未形成正式 gate

### Reporting / Filing

`dev` 已存在：

- Report Job
- Filing Package
- Dispatch Recording Index
- Monthly Trip Report
- Revenue Summary
- Settlement Matrix
- Controlled Download
- Audit

目前尚未支援：

- `daily_dispatch_record`
- `six_month_operations_summary`
- Dispatchable supply periodic snapshot
- 半年摘要中的平均可派車輛數與 coverage 指標

---

## 1.2 不重做的能力

本次修正不得重新開發：

- Dispatch Engine
- Complaint Center
- Fleet Partner Revenue Share Core
- Tenant Governance
- Service Product Admin CRUD
- Vehicle Eligibility Matrix Admin CRUD
- Driver Task Lifecycle
- General Report Job Framework
- Filing Package Framework

本次工作以「補 seam、補 write flow、補精確本體、補真機證明、補報表類型」為主。

---

# 2. 目標與非目標

## 2.1 系統目標

### G-01 車行自主建立供給

車行可自行提交司機、車輛、保險、契約與關聯資料，不靠智慧運輸科技代建。

### G-02 平台受控審核

智慧運輸科技可受理待審資料、附件審件、核可或駁回；只有核可後才寫入 canonical registry 並供派遣。

### G-03 可派性可解釋

系統必須能明確回答：

- 哪一位司機、哪一台車可派？
- 可執行哪些 Service Product？
- 若不可派，缺少什麼或哪一條規則不符合？

### G-04 精確服務產品貫穿派遣

`credit_card_airport_transfer` 不得只被視為一般 `business_dispatch`，精確產品必須一路保留至 candidate、assignment 與 driver task。

### G-05 真機可信度

Android 與 iOS 實體裝置必須能驗證：

- 位置權限
- 背景定位
- 斷網補件
- App 重啟
- 弱網
- 狀態連續性
- Ops 端可見性

### G-06 基本營運統計可固定輸出

系統可自動產生：

- 每日派遣紀錄
- 最近半年營運摘要

不得依賴人工 SQL 或手工試算表。

---

## 2.2 非目標

本次不處理：

- 外部監理資料自動報驗
- 其他派遣業者既有 API 查詢
- 車行保費是付給平台代繳
- 自動核保保險效力
- 車行完整會計系統
- CTI provider integration
- AI 語音客服
- Passenger App
- 自駕車 runtime
- 高階 BI / Data Warehouse
- 即時細粒車跡回放產品
- 申請書類私文件產生器

---

# 3. 角色與責任

| 角色                       | 主要責任                                                     |
| -------------------------- | ------------------------------------------------------------ |
| `fleet_partner_admin`      | 建立與維護車行提交的司機、車輛、保險、契約資料，查看缺件原因 |
| `fleet_partner_ops`        | 補附件、更新到期資料、追蹤 submission 狀態                   |
| `platform_supply_reviewer` | 審核車行 submission，核可、附件補正、駁回                    |
| `platform_admin`           | 管理 service product、eligibility matrix、車行與審核權限     |
| `ops_dispatcher`           | 查看 eligible supply、派車、理解不符合原因                   |
| `driver`                   | 在 Driver App 上線、接單、回報狀態與位置                     |
| `ops_manager`              | 查看位置 stale、mobile tracking 異常與營運摘要               |
| `ops_compliance`           | 查詢每日派遣紀錄、半年摘要與客訴統計                         |
| `system`                   | 驗證完整性、建立 readiness、產生報表與稽核紀錄               |

---

# 4. 功能範圍 A：車行供給自主提交與平台審核

## 4.1 業務原則

供給資料分兩層：

### Submission Layer

由車行建立和修改，尚未成為派遣的值。

### Canonical Registry Layer

由平台審核核可後建立，供派遣、結算、客訴、報表使用。

```text
車行 Draft
→ Submit
→ Platform Review
→ Approve
→ Canonical Driver / Vehicle / Contract / Policy / Affiliation
→ Readiness Evaluation
→ 可派或不可派
```

車行不得直接修改 canonical records。若已核可資料要更新（例如保險換新），必須建立新的 `document_update` submission。

---

## 4.2 Submission 類型

```text
driver_onboarding
vehicle_onboarding
insurance_update
contract_update
driver_affiliation
vehicle_affiliation
profile_correction
```

Phase 1 必含：

- driver_onboarding
- vehicle_onboarding
- insurance_update
- contract_update
- driver_affiliation
- vehicle_affiliation

---

## 4.3 司機提交內容

操作本體：

```text
name
mobile
professionalDriverLicenseNo
professionalDriverLicenseExpiry
taxiDriverRegistrationNo
taxiDriverRegistrationArea
taxiDriverRegistrationExpiry
supportedServiceProducts
preferredVehicleId
fleetPartnerId
documents
```

系統檢查：

- 必填本體
- 日期格式
- 同平台內身分證重複
- 同平台內手機重複提示
- 文件類型與附件是否齊全
- supportedServiceProducts 是否存在且 active

系統不做：

- 外部官方身分查驗
- 自動認定證件合法
- 自動認定駕駛法律資格

---

## 4.4 車輛提交內容

操作本體：

```text
plateNo
licenseType
brand
model
modelYear
seatCount
luggageCapacity
businessArea
supportedServiceProducts
airportTransferEligible
fixedFareAllowed
currentDriverId
fleetPartnerId
documents
```

系統檢查：

- 車牌格式
- 同平台車牌唯一
- seatCount / luggageCapacity 合理範圍
- licenseType 存在
- service product 對應合法的 matrix item
- currentDriverId 若有指定，必須屬於同車行或有有效 affiliation

---

## 4.5 保險提交內容

操作本體：

```text
vehicleSubmissionId / canonicalVehicleId
insuranceType
insurer
policyNo
effectiveFrom
effectiveUntil
coverageAmount
policyFile
```

車行負責：

- 提供正確資料
- 上傳保險
- 在到期前更新

智慧運輸科技負責：

- 審核資料完整性與一致性
- 核可或退件
- 依已核可資料計算 readiness

系統不得以「保費是否由智慧運輸科技支付」作為可派條件。

---

## 4.6 契約提交內容

操作本體：

```text
contractType
fleetPartnerId
driverId
vehicleId
effectiveFrom
effectiveUntil
contractFile
```

Phase 1 支援：

```text
fleet_participation
driver_management
vehicle_management
service_product_authorization
```

---

## 4.7 Submission 狀態機

```text
draft
  ├─ submit → submitted

submitted
  ├─ reviewer picks → in_review
  ├─ withdraw → withdrawn

in_review
  ├─ approve → approved
  ├─ request changes → needs_revision
  ├─ reject → rejected

needs_revision
  ├─ fleet partner edits → draft
  ├─ resubmit → submitted

approved
  ├─ canonical record change required → create new submission

rejected
  ├─ clone as new draft
```

規則：

- `approved` submission 不得修改。
- 每次 resubmit 建立 revision number。
- Review note 必須保留。
- `needs_revision` 必須有 reason code 與人類可讀說明。
- `rejected` 必須有 final reason。

---

## 4.8 平台審核動作

審核人可執行：

```text
start_review
request_revision
approve
reject
```

核可時必須在單一交易內：

1. 驗證 submission 仍為 `in_review`
2. 驗證 revision 未變更
3. 建立或更新 canonical driver / vehicle
4. 建立 canonical contract / insurance
5. 建立 driver / vehicle fleet affiliation
6. 記錄 approved submission 與 canonical IDs
7. 重新計算 readiness
8. 發出 audit event
9. 通知車行

---

## 4.9 Readiness 結果

每個 canonical driver / vehicle 必須有可解釋的 readiness：

```text
ready
not_ready
suspended
```

原因碼至少包含：

```text
DRIVER_LICENSE_MISSING
DRIVER_LICENSE_EXPIRED
DRIVER_REGISTRATION_MISSING
DRIVER_REGISTRATION_EXPIRED
VEHICLE_DOCUMENT_MISSING
INSURANCE_MISSING
INSURANCE_EXPIRED
CONTRACT_MISSING
CONTRACT_INACTIVE
DRIVER_AFFILIATION_MISSING
VEHICLE_AFFILIATION_MISSING
SERVICE_PRODUCT_NOT_SUPPORTED
TRAINING_REQUIRED
FLEET_PARTNER_INACTIVE
MANUALLY_SUSPENDED
```

Readiness 不等於 Service Product Eligibility：

- Readiness 回答「是否可納入派遣」。
- Eligibility 回答「是否可執行某一張特定設定」。

---

## 4.10 車行 Portal 必含畫面

### Supply Dashboard

顯示：

- Draft
- 待審
- 附件補正
- 已核可
- 即將到期
- 不可派原因

### Drivers

- 清單
- 新增司機
- 編輯 draft
- 查看 submission
- 查看 canonical status
- 查看 readiness

### Vehicles

- 清單
- 新增車輛
- 綁定司機
- 支援服務
- readiness

### Documents

- 文件清單
- 上傳
- 到期日
- 待審 / 核可 / 附件

### Submissions

- 狀態
- revision
- reviewer note
- submit / withdraw / resubmit

---

## 4.11 Platform Admin 必含畫面

### Supply Review Queue

可篩選：

- 車行
- submission type
- submitted date
- status
- missing items
- service product
- business area

### Review Detail

顯示：

- 車行提交值
- 目前 canonical 值
- 文件
- validation warnings
- reviewer note
- approve / needs revision / reject

---

## 4.12 功能需求清單

```text
FR-SUP-001 車行可建立司機 draft
FR-SUP-002 車行可建立車輛 draft
FR-SUP-003 車行可上傳保險與契約
FR-SUP-004 車行可提交與撤回尚未進入審核的 submission
FR-SUP-005 車行只能存取自己的資料
FR-SUP-006 平台有統一 review queue
FR-SUP-007 審核可附件補正
FR-SUP-008 核可後建立 canonical records
FR-SUP-009 核可後建立 driver affiliation
FR-SUP-010 核可後建立 vehicle affiliation
FR-SUP-011 已核可資料更新必須重新送審
FR-SUP-012 系統產生 readiness 與原因碼
FR-SUP-013 所有 mutation 產生 audit
FR-SUP-014 文件與 submission revision 可追溯
FR-SUP-015 車行可查看對應的缺件
```

---

# 5. 功能範圍 B：精確 Service Product Eligibility 串入派車

## 5.1 問題定義

目前系統保留 broad service bucket：

```text
standard_taxi
business_dispatch
```

但實際服務產品更細：

```text
taxi_realtime
taxi_reservation
enterprise_dispatch
credit_card_airport_transfer
insurance_replacement_vehicle
travel_agency_transfer
third_party_forwarded_order
```

Broad bucket 可以用於 UI 分組或高階 dispatch semantics，但不得用來決定哪台車能否執行精確產品。

---

## 5.2 精確 Service Product 的來源

### Tenant Booking

由 `tenantServiceProgramId` 對應唯一 active product。

### Partner Booking

由 partner program / entry 對應唯一 active product。

### Ops / Phone Booking

客服必須明確選擇 product，不得只選 broad bucket。

### Third-party Forwarded Order

由 adapter 的 mapping table 對應內部 product；若未對應，設定為 `manual_review`，不得猜測。

---

## 5.3 必須貫穿的資料鏈

```text
Booking
→ OwnedOrder / ForwardedMirror
→ DispatchJob
→ DispatchCandidate
→ Assignment
→ DriverTask
→ Trip / Completion
→ Settlement / Reporting
```

每一層至少保存：

```text
serviceProductId
serviceProductCode
serviceProductVersion
eligibilityPolicyVersion
```

不得在中途重新從 `serviceBucket` 推論 product。

---

## 5.4 Eligibility 判斷維度

### Driver

- lifecycle active
- work state
- license valid
- registration valid
- training complete
- service product enabled
- source platform binding
- no manual suspension

### Vehicle

- canonical active
- dispatchable
- license type
- service product supported
- seat count
- luggage capacity
- airport eligibility
- fixed fare allowed
- insurance valid
- contract active
- fleet affiliation valid

### Context

- business area
- pickup time
- reservation lead time
- tenant program
- source platform
- passenger count
- luggage count
- accessibility requirement
- proof requirement

---

## 5.5 Hard 與 Soft Constraints

### Hard constraints

不允許 override：

```text
inactive driver
inactive vehicle
expired mandatory license
expired required insurance
service product matrix denied
source platform binding absent
fleet partner inactive
vehicle not dispatchable
```

### Soft constraints

可由有權限 Ops 以原因 override：

```text
preferred vehicle model
preferred driver language
rating threshold
non-mandatory luggage preference
tenant preference
```

所有 soft override 必須：

- required reason
- actor
- timestamp
- audit ID

---

## 5.6 Eligibility Decision

每個 candidate 回傳：

```text
eligible
conditionally_eligible
ineligible
```

含：

```text
reasonCodes
missingRequirements
policyVersion
evaluatedAt
locationFreshness
```

Ops 不得只看到空清單或「無車」。

---

## 5.7 Runtime 流程

```text
Order created with exact product
→ DispatchJob copies exact product
→ Candidate query loads readiness-approved supply
→ Eligibility evaluator checks driver + vehicle + context
→ Candidates returned with decision and reasons
→ Ops / engine selects candidate
→ Assignment endpoint re-evaluates
→ If still eligible, create assignment and DriverTask
→ DriverTask displays exact service product
```

Assignment 必須重新判斷，避免 candidate list 取得後到指派之間：

- 保險到期
- 司機下線
- 車輛被改派
- platform binding 失效
- 同車被另一單佔用

---

## 5.8 Third-party Forwarded Order 原則

- 外部平台保有 route / fare / passenger workflow authority。
- 我方只檢查本地 driver / vehicle / platform binding / readiness。
- 不把 forwarded order 轉成 owned dispatch。
- `serviceProductCode` 仍須保留，以便 Driver App、收據與報表分類。
- 未對應產品不得自動降級為 `business_dispatch`。

---

## 5.9 功能需求清單

```text
FR-ELIG-001 intake 必須解析出唯一 exact service product
FR-ELIG-002 order 不得只有 service bucket
FR-ELIG-003 dispatch job 保留 exact product
FR-ELIG-004 driver task 保留 exact product
FR-ELIG-005 candidate query 執行精確資格判斷
FR-ELIG-006 assignment 時重新判斷
FR-ELIG-007 回傳 reason codes
FR-ELIG-008 hard constraint 不可 override
FR-ELIG-009 soft constraint override 必須 audit
FR-ELIG-010 third-party product mapping 缺失時進 manual review
FR-ELIG-011 eligibility policy version 必須可追溯
FR-ELIG-012 airport transfer 不得以 broad business_dispatch 帶過
FR-ELIG-013 settlement / reporting 保留 exact product
```

---

# 6. 功能範圍 C：Driver App Android／iOS 實機位置與狀態驗證

## 6.1 現狀

目前 Driver App 已使用：

- `expo-location`
- `expo-task-manager`
- Android foreground service
- iOS background location mode
- 15 秒 heartbeat
- foreground / background transport
- active task bootstrap
- emulator 實測

本次目標不是重寫 location module，而是補齊 production reliability 與實體裝置證明。

---

## 6.2 目標狀態模型

| Driver 狀態         | 定位行為               |           建議節奏 |
| ------------------- | ---------------------- | -----------------: |
| `offline`           | 停止定位               |                 無 |
| `online_available`  | 背景定位，支援派車候選 |   30 秒或 100 公尺 |
| `assigned`          | 背景定位               |    15 秒或 25 公尺 |
| `enroute_to_pickup` | 背景定位               | 10–15 秒或 25 公尺 |
| `arrived_pickup`    | 背景定位               |              15 秒 |
| `on_trip`           | 背景定位               | 10–15 秒或 25 公尺 |
| `incident`          | 高頻定位               |            5–10 秒 |
| `paused`            | 低頻或停止             |       依營運需要定 |

現有程式主要以 active task 啟動，本次須補 `online_available` 狀態，否則 dispatcher 無法用位置找可派司機。

---

## 6.3 權限要求

### Foreground permission denied

- 不得上線
- 顯示明確說明與前往設定
- readiness reason：`LOCATION_PERMISSION_DENIED`

### Background permission denied

Phase 1 正式裁決：

- Driver 可登入並查看資料
- 不得進入 `online_available`
- 不得接收需要背景追蹤的任務
- 顯示 `BACKGROUND_LOCATION_REQUIRED`

原因是只允許 foreground 時，App 進背景後位置中斷，營運上不可靠派遣。

---

## 6.4 Durable Offline Queue

目前 heartbeat 使用記憶體 Promise queue。正式須改成 durable queue：

- 每筆 heartbeat 有 `eventId`
- 儲存在裝置 SQLite
- 送出成功才刪除
- 斷網後依 sequence 重送
- server 依 `eventId` 去重
- queue 有最大容量與壓縮策略
- older location 不要蓋 newer current location，但仍保留為歷史 sample

---

## 6.5 Location Freshness

後端回傳：

```text
fresh
stale
low_accuracy
missing
```

建議判斷：

```text
fresh：receivedAt <= 90 秒，accuracy <= 100m
stale：receivedAt > 90 秒
low_accuracy：accuracy > 100m
missing：無紀錄
```

對 realtime 派遣：

- stale / missing 不可進自動候選
- low_accuracy 可帶出但標示條件弱，不擺第一順位

對 reservation：

- 可提早指派，但出發前仍須 fresh location 才可正式出車

---

## 6.6 欄位與上送

每筆 heartbeat 要有：

```text
eventId
deviceId
driverId
vehicleId
taskId
sequenceNo
recordedAt
receivedAt
lat
lng
accuracy
appState
transportMode
workState
networkType
```

後端記錄：

- device clock skew
- duplicate event
- out-of-order event
- gap duration

---

## 6.7 App 關閉與 OS 行為

必須驗證：

### Android

- Foreground service notification 常駐
- App background
- Screen off
- Battery saver
- OEM battery optimization
- App process killed
- Device reboot
- Wi-Fi / 4G / 5G 切換

### iOS

- Background location indicator
- App background
- Screen off
- Low Power Mode
- Temporary network loss
- App terminated by OS
- User force quit
- Device reboot

iOS user force quit 後背景定位無法可靠持續，系統必須：

- 在 App 再次開啟時偵測 tracking gap
- 重新同步 active task
- 重新啟動 location updates
- 向 Ops 標示 gap，不得假造連續車跡

---

## 6.8 狀態一致性

驗證狀態鏈：

```text
offline
→ online_available
→ assigned
→ enroute_to_pickup
→ arrived_pickup
→ on_trip
→ completed
→ online_available / offline
```

每一步要確認：

- Driver App 顯示
- API record
- Ops Console 顯示
- location heartbeat context
- active task
- vehicle assignment

不得出現：

- App 顯示 completed，後端仍 on_trip
- App 關後回到 available，但後端仍 assigned
- 離線過久後產生的狀態錯亂
- 與 heartbeat 衝突的新位置

---

## 6.9 真機驗證矩陣

### Android 最低裝置

- Google Pixel 或 Android reference device
- Samsung 主流裝置
- Android 13 / 14 / 15 其中至少兩種

### iOS 最低裝置

- iPhone 一台較新機型
- iPhone 一台較舊但仍支援版本
- iOS 17 / 18 至少兩種

### 網路場景

- 穩定 Wi-Fi
- 4G
- 5G
- Wi-Fi → 行動網路
- 行動網路 → Wi-Fi
- 30 秒斷線
- 5 分鐘斷線
- 弱訊號
- 飛航模式後恢復

---

## 6.10 Evidence Pack

每個平台至少要提供：

- App build version
- OS version
- device model
- install / signing evidence
- permission screenshots
- background tracking screen recording
- Ops location timeline
- API event samples
- offline queue replay evidence
- state transition log
- known limitations
- tester / reviewer signoff

---

## 6.11 功能需求清單

```text
FR-MOB-001 online_available 期間持續定位
FR-MOB-002 foreground permission 缺失時不可上線
FR-MOB-003 background permission 缺失時不可上線
FR-MOB-004 heartbeat durable queue
FR-MOB-005 server idempotency
FR-MOB-006 location freshness classification
FR-MOB-007 out-of-order event 不得回寫較舊 current location
FR-MOB-008 active state 在 App restart 後恢復
FR-MOB-009 tracking gap 對 Ops 可見
FR-MOB-010 Android physical device UAT
FR-MOB-011 iOS physical device UAT
FR-MOB-012 network switching / offline replay UAT
FR-MOB-013 state chain cross-surface consistency
```

---

# 7. 功能範圍 D：每日派遣紀錄與最近半年營運摘要

## 7.1 設計原則

- 不另建第二套設定的值。
- 從現有 order、dispatch trace、assignment、driver task、location、complaint 產生 read model。
- Report Job Framework 繼續作為輸出入口。
- 日報與半年摘要皆可重算。
- 統計口徑必須固定，不得由前端自行計算。

---

## 7.2 每日派遣紀錄定義

每個 distinct order 一筆最終 record；若發生 redispatch，保留 assignment history，但 daily record 主鍵仍只有一筆 order。

操作本體：

```text
serviceDate
orderId
orderNo
orderSource
tenantId / partnerId
serviceProductCode
requestedAt
reservationTime
pickupAddressSnapshot
dropoffAddressSnapshot
firstDispatchAt
firstAssignedAt
finalDriverId
finalVehicleId
finalPlateNo
etaSecondsAtAssignment
arrivedPickupAt
tripStartedAt
tripCompletedAt
finalStatus
redispatchCount
cancellationReason
complaintCount
```

支援 order source：

```text
phone
ops_console
tenant_portal
partner_booking
api
third_party_platform
```

---

## 7.3 到場時間來源

`arrivedPickupAt` 來自 Driver Task `arrived_pickup` event。

若沒有 arrived event：

- record 保持 null
- quality flag：`ARRIVAL_EVENT_MISSING`
- 不得用 tripStartedAt 倒推到場時間

---

## 7.4 最近半年營運摘要口徑

### 乘客要求派車次數 `demandRequestCount`

期間內進入正式 booking / order 的 distinct `orderId` 數量。

不含：

- draft
- validation failed
- test data
- duplicate idempotent replay

取消仍計 demand request，因為需求曾成立。

### 實際派遣次數 `actualDispatchCount`

期間內找到第一次成功 assignment 或外部平台 accept confirmation 的 distinct `orderId` 數量。

- redispatch 不重複計數
- candidate broadcast 不算實際派遣
- assignment failed 不算
- 外部平台 lost race 不算

### 完成趟次 `completedTripCount`

期間內狀態為 `completed` 的 distinct order 數。

### 平均可派車輛數 `averageDispatchableVehicleCount`

系統每 5 分鐘依：

```text
businessArea
serviceProductCode
```

記錄可派 vehicle count。

半年平均：

```text
sum(snapshot.dispatchableVehicleCount)
/
validSnapshotCount
```

報表同時輸出：

```text
validSnapshotCount
expectedSnapshotCount
coverageRate
```

coverage 低於 95% 時，報表標示資料不完整。

### 申訴次數 `complaintCount`

期間內建立的 distinct complaint case 數，依 category 分組。

---

## 7.5 每日與每月排程

### 每 5 分鐘

建立 dispatchable supply snapshot。

### 每日 00:15

重建前一日 daily dispatch records。

### 每月 01 日 01:00

重建前一月 operations summary。

### On-demand

Ops 可指定日期區間重算並產生 report job。

---

## 7.6 報表格式

### Daily Dispatch Record

- CSV
- XLSX
- PDF summary

### Six-Month Operations Summary

- PDF summary
- CSV detail
- JSON artifact for internal automation

---

## 7.7 Ops UI

### Reports Page 新增

```text
每日派遣紀錄
半年營運摘要
```

可篩選：

- 日期
- business area
- service product
- order source
- tenant / partner
- status

顯示：

- generatedAt
- data coverage
- source freshness
- report status
- download
- regenerate

---

## 7.8 功能需求清單

```text
FR-REP-001 每個 order 產生一筆 daily dispatch record
FR-REP-002 redispatch history 可查但不重複主鍵
FR-REP-003 arrivedPickupAt 只取 arrived event
FR-REP-004 支援所有 order source
FR-REP-005 每 5 分鐘建立 dispatchable supply snapshot
FR-REP-006 半年 demand count 固定口徑
FR-REP-007 半年 actual dispatch count 固定口徑
FR-REP-008 半年 complaint count 固定口徑
FR-REP-009 average dispatchable vehicles 輸出 coverage
FR-REP-010 可指定區間重算
FR-REP-011 報表透過既有 controlled download
FR-REP-012 所有 report generation 有 audit
```

---

# 8. 權責與資料隔離

## 8.1 Fleet Partner

只能：

- 建立自己車行的 submission
- 讀取自己車行的 submission / canonical summary
- 修改 draft / needs_revision
- 查看 readiness 與 statement

不得：

- 核可自己的 submission
- 直接修改 canonical registry
- 查看其他車行
- 修改 service product matrix

## 8.2 Platform Supply Reviewer

可以：

- 查看待審 submission
- start review
- needs revision
- approve
- reject

不得：

- 修改已核可的原始 submission
- 繞過必填文件
- 同時以 fleet partner 身分核可自己提交的資料

## 8.3 Ops Dispatcher

只讀供給 readiness / eligibility，不修改證件或保險。

## 8.4 Driver

只可送自己的 location / task state，不能指定其他 driverId。

---

# 9. 錯誤與例外

## Supply

```text
SUBMISSION_NOT_EDITABLE
SUBMISSION_REVISION_CONFLICT
SUBMISSION_INCOMPLETE
DOCUMENT_REQUIRED
DOCUMENT_EXPIRED
PLATE_ALREADY_EXISTS
DRIVER_IDENTITY_ALREADY_EXISTS
FLEET_SCOPE_DENIED
REVIEWER_SELF_APPROVAL_DENIED
```

## Eligibility

```text
SERVICE_PRODUCT_REQUIRED
SERVICE_PRODUCT_MAPPING_MISSING
SERVICE_PRODUCT_INACTIVE
DRIVER_NOT_READY
VEHICLE_NOT_READY
VEHICLE_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT
DRIVER_NOT_ELIGIBLE_FOR_SERVICE_PRODUCT
PLATFORM_BINDING_REQUIRED
LOCATION_STALE
NO_ELIGIBLE_SUPPLY
ELIGIBILITY_CHANGED_BEFORE_ASSIGNMENT
```

## Mobile

```text
LOCATION_PERMISSION_DENIED
BACKGROUND_LOCATION_REQUIRED
HEARTBEAT_DUPLICATE
HEARTBEAT_OUT_OF_ORDER
HEARTBEAT_QUEUE_FULL
DEVICE_NOT_BOUND
LOCATION_STALE
```

## Reporting

```text
REPORT_SOURCE_INCOMPLETE
SUPPLY_SNAPSHOT_COVERAGE_LOW
REPORT_REBUILD_IN_PROGRESS
REPORT_PERIOD_INVALID
```

---

# 10. 驗收流程與 Workflow Families

## `WF-SUPPLY-001 Fleet Partner Supply Onboarding`

```text
車行建立 driver draft
→ 車行建立 vehicle draft
→ 上傳 insurance / contract
→ submit
→ platform needs revision
→ 車行補正 resubmit
→ platform approve
→ canonical records + affiliations
→ readiness = ready
```

## `WF-ELIG-001 Exact Service Product Runtime Eligibility`

```text
建立 airport transfer booking
→ exact product preserved
→ candidate query
→ ineligible taxi rejected
→ eligible vehicle accepted
→ assignment recheck
→ driver task shows airport transfer
```

## `WF-MOBILE-001 Physical Device Location / State Continuity`

```text
physical device login
→ online_available tracking
→ assignment
→ background
→ network loss
→ offline queue
→ reconnect replay
→ arrived/start/complete
→ Ops location/state consistency
```

## `WF-OPS-REPORT-001 Dispatch Operations Records`

```text
create orders from multiple sources
→ dispatch / complete / cancel
→ create complaints
→ generate daily report
→ generate six-month summary
→ verify counts and coverage
```

---

# 11. 系統驗收標準

## Supply

- 車行可自行建檔，不靠平台代建。
- 平台核可後資料才進 canonical registry。
- 附件補正可保留 revision history。
- 核可後 driver / vehicle / contract / insurance / affiliations 全部可追溯。
- readiness reason 可解釋。

## Eligibility

- Exact product 全鏈路保留。
- Airport transfer 不可被 broad bucket 帶過。
- Assignment 前必須重評。
- Ops 可看到失敗原因。
- Driver App 顯示 exact product。

## Mobile

- Android 與 iOS 各至少兩種測試組合。
- 背景位置可持續。
- 斷網可 durable replay。
- 舊 heartbeat 不要蓋新位置。
- App restart 可恢復 active state。
- Ops 可看到 stale / gap。

## Reporting

- Daily record 可從真事件重建。
- 半年 summary 口徑一致。
- average dispatchable vehicles 有 coverage。
- 報表可由既有 Reporting/Filing 下載。
- 不需要人工 SQL。

---

# 12. 優先順序

## Wave 1 — Supply Onboarding

```text
SUPPLY-ONB-001 Driver Submission
SUPPLY-ONB-002 Vehicle Submission
SUPPLY-ONB-003 Document Submission
SUPPLY-ONB-004 Review Queue
SUPPLY-ONB-005 Vehicle Fleet Affiliation
SUPPLY-ONB-006 Readiness Reasons
```

## Wave 2 — Runtime Eligibility

```text
ELIG-RUNTIME-001 Exact Product Propagation
ELIG-RUNTIME-002 Candidate Evaluation
ELIG-RUNTIME-003 Assignment Recheck
ELIG-RUNTIME-004 Reason Codes
ELIG-RUNTIME-005 Airport Negative Test
```

## Wave 3 — Mobile Productization

```text
MOB-LOC-001 Online Available Tracking
MOB-LOC-002 Durable Heartbeat Queue
MOB-LOC-003 Server Idempotency
MOB-LOC-004 Freshness / Gap
MOB-UAT-001 Android Physical Device
MOB-UAT-002 iOS Physical Device
```

## Wave 4 — Operational Reports

```text
OPS-REP-001 Daily Dispatch Record
OPS-REP-002 Dispatchable Supply Snapshot
OPS-REP-003 Six-Month Summary
OPS-REP-004 Ops Report UI
OPS-REP-005 Export / Audit
```

---

# 13. 最終 SA 結論

本次修正的核心不是再增加抽象模組，而是把四條斷掉的鏈接回：

```text
車行建供給 → 平台審核 → canonical registry
精確服務產品 → 資格判斷 → 正確派車
真機位置/狀態 → Ops 可見 → 中斷可恢復
派遣事件 → 每日紀錄 → 半年摘要
```

CTI 不在本文件範圍內，待供應商選定後再另以獨立完整設計處理。
