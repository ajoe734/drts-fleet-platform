# 多元化計程車操作 UI 完整需求

**文件版本：** v1.2

**日期：** 2026-07-24

**狀態：** Approved for Full-Suite Implementation

**對象：** Product Design、Frontend、Backend、QA、法遵審查

**系統基準：** `dev@2711c366f2e103ae9556d5afaf4558dfd9b0bb4c`

**執行對照：**
`10_full_17_screen_fleets_execution_tasks_20260724.md`

---

# 0. 2026-07-24 產品決策變更

v1.1 曾依「只做法規與實用性最低需求」把操作 UI 縮為 4 個 delta。
Product Owner 於 2026-07-24 改變決定，核准原 17 個營運畫面全部進入開發。

本版採雙層範圍：

1. 第 4 節的 4 個 delta 仍是法規／上線最低基線；
2. 第 6 節的 17 頁是本次產品決策新增的完整營運套件。

完整套件屬產品與營運選擇，不代表下列功能都是法規明文要求。實作仍不得
建立法律 bypass、偽造付款／評價／證明，或把 `design-only` action 當成
已核准後端 command。

本次同時核准：

- 6 頁 Operating Authorization；
- 3 頁 Queue Operations；
- 3 頁 Rating Governance；
- 5 頁 Fare、Payment、Certificate、Records、Export／Retention。

不重新引入「為交付而交付」的 Figma、全畫面 PNG 或獨立 Design QA gate。
repository 內的 code canvas 為本輪核准設計來源。

---

# 1. 範圍判斷原則

每個 UI 要求必須至少符合一項：

1. 法規明文要求使用者可取得、輸入或下載資訊；
2. 現場人員若無此資訊，無法正確完成必要工作；
3. 既有後端能力需要最小操作入口，且可直接沿用現有頁面。
4. Product Owner 已明確核准為營運效率、治理或客服工具。

即使已核准完整套件，下列理由仍不足以擴大這 17 頁以外的範圍：

- 只是讓 architecture 看起來完整；
- 尚無 API command，但先畫一套操作；
- 只為可能發生的未定義例外建立 console；
- 其他產品線有同類頁面；
- 只為產出 Figma、PNG 或 checklist。

設計不得建立第二套 multi-taxi design system，也不得把後端 reason code
直接丟給營運人員。

---

# 2. 法規與 UI 的正確關係

截至 2026-07-23，本文件採用下列官方來源：

1. [交通部現行《汽車運輸業管理規則》](https://motclaw.motc.gov.tw/webMotcLaw2018/Law/ArticleContent?LawID=E0046101&type=-1)
2. [第 4 條申請核准區段](https://motclaw.motc.gov.tw/webMotcLaw2018/Law/ArticleContent?LawID=E0046097&NoRange=3-7)
3. [第 91 條多元化計程車區段](https://motclaw.motc.gov.tw/webMotcLaw2018/Law/ArticleContent?LawID=E0046097&NoRange=91-96.10)
4. [附表一之一營業計畫書應載事項](https://gazette.nat.gov.tw/egFront/fileView.do?fileName=57dfe30d0489841c265040d2512554a7435819b43af6e2606c151421bfc231987d6f608b6ebcdde6&fileType=fileroot)

| 法規結果                               | 系統最低需求                       | 是否需要專用 UI                    |
| -------------------------------------- | ---------------------------------- | ---------------------------------- |
| 營業計畫書及變更經核准                 | Runtime 使用正確核准資料與車輛範圍 | 不一定；既有管理頁即可             |
| 僅預約載客                             | Intake 固定為 `platform_reserved`  | 不需要新頁                         |
| 不得巡迴攬客或招呼站排班               | 後端拒絕違規 queue mode            | 不需要新頁；既有 dispatch 顯示即可 |
| 叫車時提供車輛、駕駛、評價、路線與車資 | 既有 Passenger ride 顯示完整資料   | 不需要新 route                     |
| 乘後可評價                             | 完成旅程後可送出評分               | 不需要 moderation console          |
| 依營業計畫期程全面電子支付             | 乘客可辨識付款結果                 | 不需要 payment exception console   |
| 免計費表時提供電子化乘車證明           | 乘客可讀取法定欄位                 | 沿用既有 ride/receipt surface      |
| 營運資料至少保存二年                   | 保存 730 日並可查詢                | 需要最小查詢入口                   |
| 配合主管機關查詢及下載                 | 可依範圍下載法定欄位               | 需要最小下載能力                   |

法規規定的是結果，不指定 React route、後台頁數、Figma 或 PNG。本版新增
專頁是產品決策，不是法規解讀變更。

---

# 3. Repository 現況

| 能力            | 現況                                         | 本版決定                                  |
| --------------- | -------------------------------------------- | ----------------------------------------- |
| 營運許可        | 已有 `/multi-taxi-authorizations` 頁面及 API | 擴成 registry/detail/draft/confirm/vehicles/states |
| Queue hard gate | Contract、policy 與 negative test 已存在     | 增加 overview/detail/legal-denial 三頁    |
| 乘客評價        | Passenger API/contract 已存在                | 保留 ride flow，另增加三頁 rating governance |
| Payment state   | Passenger authority contract 已存在          | 保留乘客狀態，另增加 exception detail     |
| 電子乘車證明    | Passenger receipt API/contract 已存在        | 保留 passenger receipt，另增加 support 頁 |
| 二年紀錄        | 基本 query/CSV 已存在                        | 擴成 records detail 與 controlled export/retention |

P-5 Passenger 與 S-3 既有 canvas 不重做；17 頁增量使用 2026-07-23 上傳的
code canvas，並依本版 command gate 實作。

---

# 4. 法規／上線最低 UI Delta

## `MTX-UI-MVP-01` 既有營運許可頁

**沿用 route：** `/multi-taxi-authorizations`

**使用者：** 經授權的 Platform Admin

**目的：** 讓系統使用的核准資料與主管機關核准內容一致。

### 必須顯示

- 業者；
- 許可／核准識別碼；
- 營業計畫版本；
- 狀態；
- 營運區域；
- 生效與失效時間；
- 生效費率版本；
- 納入此計畫的車輛及有效期間。

### 必須支援

- 建立 draft；
- 編輯 draft；
- 啟用 draft 或 suspended record；
- 暫停 approved record；
- 加入車輛；
- 顯示 API validation error。

只能呈現目前已核准的 commands：

```text
create draft
update draft
activate
suspend
add vehicle
```

不得新增：

```text
revoke
restore
delete
vehicle suspend
legal hold
bulk import
```

除非對應 API、權限及 lifecycle 已另行核准。

### 最小狀態

```text
loading
empty
loaded
save_failed
permission_denied
```

`draft`、`approved`、`suspended`、`expired`、`revoked` 必須以文字顯示；
`expired` 與 `revoked` 為唯讀。

### 驗收

使用者不離開既有頁面即可判斷：

1. 哪一個核准目前有效；
2. 哪些車輛在有效範圍內；
3. 使用哪個費率版本；
4. 現在可執行哪些既有 command。

---

## `MTX-UI-MVP-02` 既有 Dispatch Queue 標示

**沿用 route：** `/dispatch` 與既有 dispatch detail

**使用者：** Ops dispatcher

**目的：** 避免把平台內部媒合誤認為實體招呼站排班。

### 必須顯示

對 `multi_taxi_direct` 顯示：

```text
服務類型：多元化計程車（平台預約）
媒合方式：平台媒合
```

對應值：

```text
runtimeProfileCode = multi_taxi_direct
acquisitionMode = platform_reserved
queueMode = virtual_matching
```

不得在 multi-taxi 操作中提供：

```text
street_hail
physical_rank
taxi_stand
```

若後端拒絕不相容的 queue mode，既有頁面只需顯示：

```text
此訂單為多元化計程車平台預約，不能進入實體排班或招呼站候客。
```

不得提供「仍要派遣」或其他 bypass 按鈕。

### 法規最低版本身不要求

- 新增 queue 管理首頁；
- 新增 queue detail route；
- 新增 legal denial 專頁；
- 顯示 raw reason code；
- 為三種 queue mode 建立營運設定器。

本版第 6 節已另以產品決策核准 queue overview/detail/denial 三頁，但上述
hard gate 與禁止 bypass 規則不變。

### 驗收

Ops 在既有 dispatch list/detail 即可辨識服務類型與媒合方式；違規組合由
後端拒絕，UI 只負責清楚說明。

---

## `MTX-UI-MVP-03` 既有 Passenger Ride 法定狀態

**沿用 route：** `/ride/{token}` 與既有 fares/receipt surface

**使用者：** 乘客

**目的：** 完成乘前資訊、乘後評價、支付結果及適用時的電子乘車證明。

### 乘前資訊

既有 ride surface 必須顯示：

- 車輛廠牌、車型、牌照號碼、出廠年份及車門數；
- 駕駛人有效執業登記顯示；
- 駕駛評價，無評價時顯示「新進駕駛」；
- 預估路線；
- 預估或應付車資；
- 車資變更規則。

缺少法定資料時不得顯示假預設值，也不得完成指派。

### 乘後評價

旅程完成且 `canRate = true` 時：

- 可送出 1 至 5 分；
- 已送出時顯示結果，不重複建立另一筆評價；
- 乘客流程本身不提供管理員修改平均分數的 UI；
- 第 6 節另有 moderation queue，但不得直接編輯 aggregate。

### 支付狀態

只需將既有 canonical status 轉為乘客可理解的結果：

| Status            | 顯示               |
| ----------------- | ------------------ |
| `not_selected`    | 尚未選擇付款方式   |
| `authorized`      | 已授權，待完成扣款 |
| `captured`        | 付款完成           |
| `failed`          | 付款失敗           |
| `refunded`        | 已退款             |
| `manual_recovery` | 請聯絡客服確認付款 |

只有後端提供 retry command 時才顯示「重新付款」。不得假裝付款成功。

### 電子乘車證明

在免裝計費表或產品採電子證明的適用情形，必須能讀取：

- 車號；
- 上下車時間與行駛時間；
- 路線與里程；
- 車資金額；
- 客服電話；
- 主管機關申訴電話。

證明尚未產生時顯示「乘車證明準備中」；API 失敗時提供重試讀取。第 6 節
另有後台 certificate support，但不能取代 Passenger flow。

### 驗收

Passenger ride 主流程可完成：

```text
乘前查看
→ 搭乘
→ 付款結果
→ 乘後評價
→ 讀取乘車證明
```

新增的治理／客服管理頁必須與 Passenger flow 分離，不能改變乘客 authority。

---

## `MTX-UI-MVP-04` 二年營運紀錄查詢與下載

**建議 route：** 優先整合既有 reporting/admin，必要時新增
`/multi-taxi-records`。

**使用者：** 既有授權的 Platform Admin／法遵人員

**目的：** 滿足至少二年保存及主管機關查詢下載。

### 法定欄位

- 車號；
- 預約時間；
- 上車時間；
- 下車時間；
- 行駛路線；
- 行駛里程；
- 應付車資；
- 實收車資；
- 通行費。

### 最小查詢

- 日期區間；
- 車號；
- 訂單／趟次識別碼；
- 查詢結果數；
- 單筆詳情。

### 最小下載

- 下載目前查詢範圍；
- CSV 或主管機關同意的既有格式；
- 顯示匯出筆數與資料範圍；
- 沿用現有登入、授權及 audit primitive。

法規最低版原可不建立：

- export job queue；
- retry dashboard；
- legal hold；
- archive tier console；
- 自訂 retention policy editor。

Product Owner 已於 v1.2 核准 controlled export/retention 頁及 server export
job；legal hold 先完成 display/filter，write actions 依第 7 節 command gate。
archive tier 與自訂 retention editor 仍不在範圍。

畫面只需顯示：

```text
法定最低保存期間：各趟次至少二年
```

實際 730 日保存與 purge policy 由後端負責，UI 不得讓使用者縮短。

### 驗收

授權人員能在合理時間內找到一趟紀錄並下載指定範圍；未授權使用者沿用
既有 access control 被拒絕。

---

# 5. 共用實用性要求

所有法規 delta 與 17 頁至少要求下列基本狀態：

```text
loading
empty
success
validation error
request error
permission denied
```

不為極低機率情境建立專頁。錯誤優先在原操作位置顯示，並提供可行下一步。

基本可用性：

- 狀態不得只靠顏色；
- 表單欄位有可見 label；
- 鍵盤可完成主要 desktop 操作；
- 乘客頁維持 mobile-first；
- 既有中文字詞優先，不顯示 raw enum；
- 日期時間標示時區；
- 金額標示 NTD。

這些是基本可用性要求，不宣稱為多元化計程車法規明文，也不要求另做
無障礙認證。若政府採購或其他契約另有 AA／APP 無障礙要求，另開任務處理。

---

# 6. 核准開發的 17 頁

## 6.1 Operating Authorization：6 頁

| Screen ID        | 頁面                      | 建議 route／surface                              |
| ---------------- | ------------------------- | ----------------------------------------------- |
| `MTX-AUTH-UI-01` | Authorization Registry    | `/multi-taxi-authorizations`                    |
| `MTX-AUTH-UI-02` | Authorization Detail      | `/multi-taxi-authorizations/{authorizationId}`  |
| `MTX-AUTH-UI-03` | Draft Editor              | `/multi-taxi-authorizations/new`／draft edit    |
| `MTX-AUTH-UI-04` | Lifecycle Confirmation    | detail 內受控 confirmation flow                 |
| `MTX-AUTH-UI-05` | Authorized Vehicles       | authorization detail 的 vehicles surface        |
| `MTX-AUTH-UI-06` | Conflict／Permission State | 共用 stale、forbidden、unavailable state surface |

六頁必須使用同一 authorization authority，不建立第二份 client-side
lifecycle。已核准 live commands：

```text
create draft
update draft
activate
suspend
add vehicle
```

`revoke`、`restore`、`delete`、vehicle suspend/remove 只有在對應 command、
permission、audit 與 tests 落地後才能啟用；在此之前可保留 disabled
`command pending` 說明，不可模擬成功。

## 6.2 Queue Operations：3 頁

| Screen ID         | 頁面                        | 建議 route／surface                 |
| ----------------- | --------------------------- | ---------------------------------- |
| `MTX-QUEUE-UI-01` | Queue Overview              | `/dispatch/queue`                  |
| `MTX-QUEUE-UI-02` | Queue Entry Detail          | `/dispatch/queue/{queueEntryId}`   |
| `MTX-QUEUE-UI-03` | Non-Bypassable Legal Denial | detail 或 denial state             |

Overview/detail 必須顯示 queue mode、runtime profile、service area、site、
driver/vehicle、authorization、eligibility、check-in 與 last update。
`multi_taxi_direct` 的 `physical_rank`／`taxi_stand` denial 永遠不得提供
override 或 force check-in。

## 6.3 Rating Governance：3 頁

| Screen ID       | 頁面                    | 建議 route／surface              |
| --------------- | ----------------------- | ------------------------------- |
| `P5-RATE-UI-01` | Rating Review Queue     | `/p5-ratings`                   |
| `P5-RATE-UI-02` | Rating Review Detail    | `/p5-ratings/{ratingId}`        |
| `P5-RATE-UI-03` | Driver Rating Authority | driver rating authority surface |

Review queue 支援 status、score、tag、driver、trip/order、date filters。
Invalidation 必須有 reason、confirmation、audit 與 aggregate rebuild。平均分、
rating count 與 score 不可直接編輯；restore command 未核准前保持 disabled。

## 6.4 Fare、Payment、Certificate、Records：5 頁

| Screen ID      | 頁面                          | 建議 route／surface                    |
| -------------- | ----------------------------- | ------------------------------------- |
| `P5-COM-UI-01` | Fare Anomaly Queue／Detail   | `/p5-fare-anomalies`                  |
| `P5-COM-UI-02` | Payment Exception Detail      | `/payments/{orderId}`                 |
| `P5-COM-UI-03` | Certificate Support           | `/multi-taxi-certificates`            |
| `P5-COM-UI-04` | Operational Record Query      | `/platform-admin/p5/records`          |
| `P5-COM-UI-05` | Controlled Export／Retention | records 內 export/retention surface   |

Fare anomaly 維持 fail closed，不提供人工金額 bypass。Payment exception
不得把 `failed`／`manual_recovery` 顯示成已付款，也不得顯示 raw card data。
Certificate support 可定位與重開既有證明；regeneration command 落地前保持
disabled。

Controlled export 必須由 server 產生，流程至少包含 scope preview、purpose、
record count、pending/running/completed/failed、audit 與 controlled download。
Legal hold 在本期需完成 display/filter；create/release action 需先完成獨立
command、permission 與 audit task。

---

# 7. Command 與 Backend Dependency Gate

17 頁全部核准開發，但 page approval 不等於 write command 已存在。

| 能力                              | 本期要求                                           |
| --------------------------------- | -------------------------------------------------- |
| Authorization 既有 lifecycle     | 直接接 canonical API                               |
| Vehicle remove/suspend            | 先完成 command task，再啟用 UI                     |
| Queue denial                      | 只顯示 server decision，不得加入 bypass            |
| Rating invalidate                 | 完成 moderation command、reason、audit、rebuild    |
| Rating restore                    | command 未核准前 disabled                          |
| Fare anomaly retry/recovery       | 只依 server `availableActions` 啟用                |
| Payment recovery                  | 只依 provider/backend descriptor 啟用              |
| Certificate regeneration          | command 未落地前 disabled                          |
| Controlled export                 | 實作 server job，不得只在 browser 產出敏感匯出     |
| Legal hold create/release         | 獨立 evidence-governance command 完成後才啟用      |

每個 mutation 必須有 capability、idempotency、audit receipt、conflict handling
與 negative test。這些是可執行 command 的基本完整性，不是額外畫面要求。

---

# 8. 核准設計來源

正式 code canvas：

```text
docs/05-ui/drts-design-canvas/
```

提交來源 snapshot：

```text
docs/05-ui/drts-design-canvas/archive/20260723-driver-app-15/
```

17 頁已由下列檔案覆蓋：

```text
platform-mtx-auth.jsx       MTX-AUTH-UI-01..06
ops-mtx-queue.jsx           MTX-QUEUE-UI-01..03
platform-mtx-commerce.jsx   P5-RATE-UI-01..03 + P5-COM-UI-01..05
Platform Admin.html         Platform Admin frame integration
Ops Console.html            Ops frame integration
```

Fleets 必須重建為 production stack 並接 canonical contracts；不得把 canvas
fixture 當 production data。Figma、全畫面 PNG 與獨立 Design QA package
不是開工 gate；每個 UI PR 仍須附實際變更 screenshot 與 tests。

---

# 9. Full-Suite Definition of Done

只有下列條件全部完成，17 頁範圍才可 close：

1. 17 個 Screen ID 均有 production route 或明確嵌入 surface；
2. 4 個法規最低 delta 仍完整；
3. read/write capability 與 server authorization 一致；
4. unsupported command 保持 disabled，不模擬成功；
5. queue denial 無 legal bypass；
6. rating aggregate、fare、payment、receipt 不使用 fixture 或假預設值；
7. controlled export 由 server 產生並有 audit；
8. legal hold 與 retention 為不同狀態；
9. loading、empty、error、permission、stale/conflict 可驗證；
10. 繁中／英文 translation keys、keyboard flow 與 200% zoom 通過；
11. 每頁有 current-head unit/integration 或 E2E evidence；
12. Fleet H 完成跨 surface final matrix。

---

# 10. Fleets Handoff

| Screen group                    | Fleet／Task |
| ------------------------------- | ----------- |
| `MTX-AUTH-UI-01..06`            | Fleet B：`MTX-AUTH-UI-001` |
| `MTX-QUEUE-UI-01..03`           | Fleet C：`MTX-QUEUE-003` |
| `P5-RATE-UI-01..03`             | Fleet D：`P5-RATE-003`、`P5-RATE-UI-001` |
| Passenger legal ride states     | Fleet E：`P5-PAX-WEB-001` |
| `P5-COM-UI-01..05`              | Fleet F：fare/payment/receipt/retention/export/hold tasks |
| S-3 current-head verification   | Fleet G：`S3-VERIFY-UI-001` |
| 17-page cross-surface acceptance | Fleet H：`E2E-MTX-UI-FULL-001` |

詳細 ownership、branch reconciliation、dependency 與 PR contract 見
`10_full_17_screen_fleets_execution_tasks_20260724.md`。
