# 一般計程車 vs 多元化計程車派遣行為合規與系統架構決策

**文件版本：** v2.0  
**原始文件日期：** 2026-07-21  
**系統設計修訂日期：** 2026-07-23  
**Repository：** `ajoe734/drts-fleet-platform`  
**審查分支：** `dev`  
**已驗證 Commit：** `ff16b7131bee4594ec56b195d43539a8d65ce379`  
**文件性質：** 法規行為模型、系統現況、目標架構與不可再下放之設計決策  
**預期讀者：** 產品、系統設計、Backend、Web、Mobile、Ops、QA、法遵

---

# 1. 最終結論

目前 `dev` 已經具有：

- 一般計程車即時派遣骨架。
- 商務預約派車骨架。
- Service Product / Eligibility。
- 多元化計程車 P-5 / S-3 contracts 與 schema anchors。
- 車輛揭露與駕駛執登 canonical 資料。
- S-3 backend、Driver UI、Ops UI。
- P-5 Passenger 與 Admin UI。

但目前仍**不能宣稱一般計程車與多元化計程車雙軌營運均已完整、合規上線**。

原因已不再是「完全沒有 P-5 / S-3」，而是：

1. `multi_taxi_direct` typed intake 接錯到 `businessDispatchSubtype`。
2. Runtime profile 仍可由 raw header 提示，尚未成為 server-resolved order authority。
3. 尚無多元化計程車營運授權與參與車輛 authority。
4. 尚未區分內部虛擬媒合 queue 與實體招呼站／排班 queue。
5. P-5 eligibility hard gate 尚未真正執行。
6. Assignment 尚未原子建立法定 disclosure snapshot。
7. Passenger Web 仍是 fixture-backed，尚未接 live token / API / SSE。
8. Rating、Fare confirmation、Payment、Receipt、730 日營運紀錄尚未閉環。

因此正式裁決為：

> **一般計程車與多元化計程車必須是兩個 runtime profile，彼此共用派遣骨架，但不得共用同一套取得乘客方式、營運授權、P-5 揭露、費率、支付與證據保留規則。**

---

# 2. 法規基線

本文件採用下列現行中央規範：

- 《汽車運輸業管理規則》第 2 條：
  - 多元化計程車客運服務係以網際網路平臺整合供需訊息，提供預約載客之計程車服務。
- 第 4 條：
  - 經營多元化計程車客運服務，應檢具營業計畫書向主管機關申請核准；變更時亦同。
- 第 11-1 條：
  - 費率須在核定運價範圍內訂定、報備查並登載於平臺首頁後始得實施。
- 第 91 條：
  - 叫車時揭露車輛廠牌、車牌、出廠年份、車門數。
  - 顯示有效駕駛人執業登記證及消費者乘車評價。
  - 顯示預估路線、應付或預估車資、車資變更規則。
  - 安全帶提醒。
  - 依營業計畫書期程採全面電子支付。
  - 乘後服務品質評價。
  - 保存各趟車號、預約時間、上下車時間、路線、里程、應付／實收車資及通行費至少二年，並提供查詢及下載權限。
  - 接受乘車需求以預約載客為限，不得巡迴攬客或於計程車招呼站排班候客。
  - 免裝計費表時須有報價確認、異常處理與電子化乘車證明。

官方來源：

- https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=K0040003
- https://law.moj.gov.tw/LawClass/LawGetFile.ashx?FileId=0000351870&lan=C

---

# 3. 三個必須修正的法規建模觀念

## 3.1 「預約載客」不等於「一定是未來排程」

多元化計程車可以由乘客透過平臺或話務協助建立正式乘車需求後，立即媒合車輛；法規重點是乘客需求先經預約平臺形成，不得在街頭巡迴攬客或進實體招呼站排班。

所以應分開：

```text
取得乘客方式：
platform_reserved
street_hail
physical_rank

時間模式：
on_demand
scheduled
```

多元化 profile：

```text
platform_reserved + on_demand   合法候選
platform_reserved + scheduled   合法候選
street_hail                      禁止
physical_rank                    禁止
```

如核准營業計畫另有最短預約時間，再由 authorization policy 加上，不應硬寫在通用 runtime。

## 3.2 虛擬媒合 queue 不等於實體招呼站排班

法規禁止的是：

- 巡迴攬客。
- 計程車招呼站排班候客。

內部 dispatch engine 用候選佇列、優先序或延遲重試，不等於法定實體排班。

系統應顯式區分：

```text
virtual_matching
physical_rank
taxi_stand
```

不可直接以 API path 包含 `queue` 就認定違法，也不可讓多元化 profile 在未標 queue mode 的情況下進 queue。

## 3.3 車輛類別不等於多元化營運授權

`multi_purpose_taxi`、`taxi` 或其他 `licenseType` 只能表示車輛或牌照分類，不能證明：

- 業者的多元化營業計畫已核准。
- 該車已納入核准車輛。
- 該核准仍在效期。
- 該車可在此服務區域、費率版本營運。

因此必須新增：

```text
MultiTaxiOperatingAuthorization
MultiTaxiAuthorizedVehicle
```

---

# 4. 一般計程車與多元化計程車目標模型

| 面向 | 一般計程車 Runtime | 多元化計程車 Runtime |
|---|---|---|
| `runtimeProfileCode` | `ordinary_taxi` | `multi_taxi_direct` |
| 需求取得 | platform、street hail、依場站規則 | platform reserved only |
| 時間模式 | on-demand / scheduled | on-demand / scheduled |
| 實體招呼站 | 依地方／場站規則 | 禁止 |
| 虛擬媒合 | 可 | 可 |
| 營運授權 | 一般計程車既有 authority | 核准營業計畫 + vehicle membership |
| Service Product | `taxi_realtime` / `taxi_reservation` | `taxi_reservation` under profile |
| 車輛 | 一般合法供給 | 核准授權內合法供給 |
| 乘前揭露 | 一般產品需求 | 第 91 條法定最低資訊 |
| 費率 | 一般計費表／核定方式 | 備查及公開版本 |
| 支付 | 依產品 | 營業計畫期程全面電子支付 |
| 評價 | 產品可選 | 必須可供乘後評價 |
| 營運資料 | 一般紀錄 | 法定至少二年完整資料 |
| Passenger Surface | 一般叫車頁 | Direct P-5 statutory ride page |

---

# 5. Canonical Order Model

目標 order 不可只保存：

```text
serviceBucket
dispatchSemantics
businessDispatchSubtype
```

必須新增：

```ts
interface TaxiRuntimeContext {
  runtimeProfileCode:
    | "ordinary_taxi"
    | "multi_taxi_direct"
    | "business_dispatch";

  serviceProductCode: ServiceProductType;

  acquisitionMode:
    | "platform_reserved"
    | "street_hail"
    | "physical_rank";

  timingMode:
    | "on_demand"
    | "scheduled";

  operatingAuthorizationId: string | null;
  queueMode:
    | "virtual_matching"
    | "physical_rank"
    | "taxi_stand"
    | null;
}
```

上述 context 必須：

- 由 server resolve。
- 在 booking / order 建立時持久化。
- 下游不可重新猜測。
- 修改需有明確 transition / audit。
- webhook / reporting 保留。

---

# 6. 現行 `dev` 實作狀態

## 6.1 已落地

### Contract / DB

- `PassengerServiceRuntimeProfile`
- `VehiclePassengerDisclosureProfile`
- `DriverPublicRegistrationCredential`
- `DriverRatingSummary` contract
- `PassengerDispatchDisclosureSnapshot` contract
- Passenger token / SSE contracts
- `MultiTaxiTripOperationalRecord` contract
- Driver SOS contracts
- V0051–V0055 anchors / corrections

### Backend / Supply / S-3

- doorCount / color capture。
- canonical vehicle disclosure upsert。
- driver credential masking / backfill。
- Dedicated Driver SOS backend。
- exactly-one Incident correlation。
- urgent alert outbox。
- server-side driver identity context。

### UI

- P-5 Passenger 12-state screen set。
- P-5 Admin review / correction / fare screens。
- Driver standalone SOS。
- Ops SOS queue / detail / map / acknowledgment。

## 6.2 部分落地但不可視為完成

### A. Runtime Guard

現有 guard檢查：

```ts
command.businessDispatchSubtype === "taxi_reservation"
```

但 `taxi_reservation` 不是 `BusinessDispatchSubtype`。

這代表：

- contract 有 profile。
- code 有 guard。
- typed request 無法合法通過。
- 不能宣稱多元化 intake 完成。

### B. Passenger UI

Passenger Web 已有完整視覺與 fixture data，但 production authority仍缺：

- token。
- disclosure API。
- SSE。
- rating submit。
- receipt。
- contact session。
- live data replacement。

### C. Admin UI

Admin UI 已落地，但不能替代：

- Operating Authorization authority。
- P-5 eligibility gate。
- Assignment transaction。
- Fare activation backend。

### D. S-3

S-3 backend與 UI已合併；仍需最新 commit 上的：

- current-head E2E。
- online alert p95。
- physical device offline replay。
- attachment scan。
- browser sound readiness。
- first-ack concurrency。

## 6.3 尚未落地的核心

- `MultiTaxiOperatingAuthorization`。
- Typed multi-taxi intake。
- Queue mode split。
- Rating persistence / service。
- P-5 eligibility wiring。
- P-5 assignment snapshot persistence。
- Passenger live authority。
- Fare / route confirmation authority。
- Payment runtime。
- Seatbelt event。
- Electronic receipt generation。
- 730-day record / regulator export。

---

# 7. 現行程式的立即缺陷

## 7.1 錯誤型別連接

目前 `assertRuntimeProfileAllowances` 使用 `any` 並比較：

```text
businessDispatchSubtype
vs
taxi_reservation
```

修正：

- 建立 dedicated command。
- 移除 `any`。
- profile context使用 discriminated union。
- compile-time保證多元化 route一定是 `taxi_reservation` product。

## 7.2 Raw Header Authority

`x-runtime-profile-code` 只能做 trusted internal hint，不能由 public caller決定產品線。

## 7.3 `taxi_reservation` 預設 inactive

啟用需改成 profile-scoped，而不是 global switch。

## 7.4 Scarcity Fallback

目前只有 airport eligibility 被列為 non-bypassable。P-5 disclosure / authorization reasons也必須列入，否則無供給時可能重新顯示不合格候選。

## 7.5 Assignment 無 Snapshot

Assignment目前只持久化 assignment / task / attempt / trace，未原子建立 disclosure snapshot與consumer outbox。

## 7.6 Production Passenger 仍可 Fixture

Production route必須有 CI / runtime guard，禁止 fixture被當成 live completion。

---

# 8. 目標 Intake API

## 8.1 Passenger

```http
POST /api/multi-taxi/rides
```

Payload：

```ts
interface CreateMultiTaxiRideCommand {
  pickup: AddressPayload;
  dropoff: AddressPayload;
  passenger: PassengerProfile;
  requestedPickupAt: string;
  timingMode: "on_demand" | "scheduled";
  paymentMethodTokenRef: string | null;
  servicePreferences?: Partial<ServicePreferences>;
}
```

Server 固定：

```text
runtimeProfileCode = multi_taxi_direct
serviceProductCode = taxi_reservation
acquisitionMode = platform_reserved
orderDomain = owned
```

## 8.2 Call Center Assisted

```http
POST /api/call-center/multi-taxi/rides
```

除上述資料外：

```text
callId
agentId
recordingId（依 CTI gate）
```

電話只是需求入口；正式 order仍由同一平臺 authority建立。

## 8.3 Ordinary Taxi

既有：

```http
POST /orders
```

保留一般計程車直客 on-demand flow，但必須寫：

```text
runtimeProfileCode = ordinary_taxi
acquisitionMode = platform_reserved
timingMode = on_demand
```

街招／實體排班若未納入 Phase 1 App，不必提供 public API，但 model 必須能正確表達並禁止 multi-taxi誤用。

---

# 9. Multi-Taxi Operating Authorization

## 9.1 Authority Record

```ts
interface MultiTaxiOperatingAuthorizationRecord {
  authorizationId: string;
  operatorId: string;
  authorityCode: string;
  businessPlanVersion: string;

  serviceAreaCodes: string[];
  activeFareVersionId: string;

  status:
    | "draft"
    | "approved"
    | "suspended"
    | "expired"
    | "revoked";

  effectiveFrom: string;
  effectiveUntil: string | null;
}
```

## 9.2 Vehicle Membership

```ts
interface MultiTaxiAuthorizedVehicleRecord {
  authorizationVehicleId: string;
  authorizationId: string;
  vehicleId: string;
  status: "active" | "suspended" | "removed";
  effectiveFrom: string;
  effectiveUntil: string | null;
}
```

## 9.3 Runtime Gate

Assignment前確認：

```text
authorization active
vehicle membership active
service area allowed
fare version active
vehicle / driver canonical disclosure complete
driver registration verified_active
rating initialized
```

不得由 Ops override hard legal gate。

---

# 10. P-5 Assignment Authority

## 10.1 Non-bypassable Reasons

```text
P5_VEHICLE_MAKE_MISSING
P5_VEHICLE_MODEL_MISSING
P5_VEHICLE_YEAR_MISSING
P5_VEHICLE_DOOR_COUNT_MISSING
P5_DRIVER_REGISTRATION_MISSING
P5_DRIVER_REGISTRATION_EXPIRED
P5_DRIVER_REGISTRATION_UNVERIFIED
P5_RATING_STATE_UNINITIALIZED
P5_RUNTIME_PROFILE_MISMATCH
P5_OPERATING_AUTHORIZATION_MISSING
P5_OPERATING_AUTHORIZATION_INACTIVE
P5_VEHICLE_NOT_IN_AUTHORIZATION
P5_AUTHORIZATION_SERVICE_AREA_MISMATCH
P5_FARE_VERSION_NOT_ACTIVE
```

## 10.2 Atomic Transaction

```text
re-evaluate
→ assignment
→ task
→ PassengerDispatchDisclosureSnapshot
→ ConsumerNotificationOutbox
→ commit
```

Snapshot失敗不得留下 assignment。

## 10.3 Redispatch

```text
version N superseded
→ version N+1 assignment
→ version N+1 snapshot
→ assignment_replaced event
```

Passenger只接受較新 version。

---

# 11. 第 91 條 Passenger Workflow

```text
建立多元化計程車需求
→ 顯示 route / fare / fare-change rule
→ passenger confirms
→ authorization + eligibility
→ assignment + disclosure snapshot
→ live ride page / ETA / map
→ seatbelt reminder
→ electronic payment
→ trip completion
→ rating
→ electronic ride certificate
→ 730-day operational record
→ regulator query / download
```

任何一段缺失，不能把第 91 條閉環標示完成。

---

# 12. 一般計程車與多元化計程車共用／分離界線

## 共用

- Address / Geo。
- Service Area。
- Candidate engine。
- Assignment / Redispatch。
- Driver Task。
- Location。
- Incident。
- Billing primitives。
- Audit / Reporting infrastructure。

## 分離

- Runtime Profile。
- Acquisition rules。
- Operating authorization。
- Queue policy。
- Service-product activation。
- P-5 gate。
- Passenger disclosure。
- Fare authority。
- Payment policy。
- Retention policy。
- Public Passenger surface。

---

# 13. 系統完成判定

## 一般計程車 Runtime

可在不依賴多元化授權與 P-5 snapshot 的前提下，繼續提供一般產品；仍受一般車輛、駕駛、區域與計價規則約束。

## 多元化計程車 Runtime

只有以下全部通過才可上線：

1. Server-resolved `multi_taxi_direct`。
2. Platform-reserved acquisition。
3. Operating authorization / vehicle membership。
4. P-5 non-bypassable eligibility。
5. Atomic disclosure snapshot。
6. Live passenger token / API / SSE。
7. Route / fare / fare-change confirmation。
8. Seatbelt reminder。
9. Electronic payment。
10. Post-trip rating。
11. Electronic receipt。
12. 730-day record / export。
13. No street hail / physical rank。
14. S-3 emergency workflow production-verified。

---

# 14. 本文件直接下達的執行方向

- 不再要求開發團隊討論是否拆產品線：**已決定拆 runtime profile。**
- 不再要求開發團隊討論預約是否等於未來排程：**已決定 acquisition 與 timing 分開。**
- 不再要求開發團隊討論 queue 是否全部禁止：**已決定 virtual allowed、physical rank / stand denied。**
- 不再要求開發團隊自行發明授權 authority：**本文件已定義 operator authorization + vehicle membership。**
- 不再接受以 UI、contract、migration 單點完成宣稱 workflow closed。
