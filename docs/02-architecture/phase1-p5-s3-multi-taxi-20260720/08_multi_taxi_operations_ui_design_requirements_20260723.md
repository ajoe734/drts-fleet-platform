# 多元化計程車操作 UI 最小需求

**文件版本：** v1.1

**日期：** 2026-07-23

**狀態：** Ready for Minimal Design

**對象：** Product Design、Frontend、Backend、QA、法遵審查

**系統基準：** `dev@b8f1f56b20a77c8abeabf0ac3c51b8443d5616af`

**執行對照：** `07_fleets_execution_tasks_20260723.md`

---

# 0. 本次重新盤點結論

v1.0 把法定功能、營運控制與設計交付物混在一起，形成 17 個畫面及過多
handoff gate。v1.1 依「實用性優先、法規必要、沿用現有 UI」原則縮減為
4 個 UI delta，不再為了完整性建立專用後台。

本版明確取消下列法規 MVP gate：

- rating moderation console；
- payment exception console；
- legal hold 管理；
- 獨立 queue overview、detail、denial 三頁；
- 獨立 authorization lifecycle 與 conflict 頁；
- export job orchestration；
- 指定 Figma page structure；
- 全畫面 PNG 套件；
- 獨立 Design QA 流程。

取消上述項目不代表移除後端法定 hard gate。預約載客、禁止巡迴攬客與
招呼站排班、乘前揭露、乘後評價、電子支付、電子乘車證明及二年營運資料
仍須依適用條件完成。

---

# 1. 範圍判斷原則

每個 UI 要求必須至少符合一項：

1. 法規明文要求使用者可取得、輸入或下載資訊；
2. 現場人員若無此資訊，無法正確完成必要工作；
3. 既有後端能力需要最小操作入口，且可直接沿用現有頁面。

下列理由不足以新增畫面：

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

法規規定的是結果，不指定 React route、後台頁數、Figma 或 PNG。

---

# 3. Repository 現況

| 能力            | 現況                                         | 本版決定                             |
| --------------- | -------------------------------------------- | ------------------------------------ |
| 營運許可        | 已有 `/multi-taxi-authorizations` 頁面及 API | 改善既有頁，不重畫 6 頁              |
| Queue hard gate | Contract、policy 與 negative test 已存在     | 在既有 dispatch 頁補標示             |
| 乘客評價        | Passenger API/contract 已存在                | 完成既有 ride flow，不做 moderation  |
| Payment state   | Passenger authority contract 已存在          | 顯示必要狀態，不做 exception console |
| 電子乘車證明    | Passenger receipt API/contract 已存在        | 沿用既有 ride/receipt surface        |
| 二年紀錄        | Contract 已存在，查詢下載尚未閉環            | 新增一個最小 admin surface           |

設計工作只處理尚未清楚的 delta，不重做已存在的 P-5/S-3 canvas。

---

# 4. 最小 UI Delta

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

### 不需要

- 新增 queue 管理首頁；
- 新增 queue detail route；
- 新增 legal denial 專頁；
- 顯示 raw reason code；
- 為三種 queue mode 建立營運設定器。

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
- 不需要提供管理員修改平均分數的 UI；
- 不需要在本期建立 moderation queue。

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

證明尚未產生時顯示「乘車證明準備中」；API 失敗時提供重試讀取，不建立
後台 certificate support console。

### 驗收

Passenger ride 主流程可完成：

```text
乘前查看
→ 搭乘
→ 付款結果
→ 乘後評價
→ 讀取乘車證明
```

不新增與此流程無關的管理畫面。

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

資料量未證明需要非同步工作前，不建立：

- export job queue；
- retry dashboard；
- legal hold；
- archive tier console；
- 自訂 retention policy editor。

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

所有 delta 只要求下列基本狀態：

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

# 6. 明確延後項目

| 項目                           | 本期決定     | 重新啟動條件                                          |
| ------------------------------ | ------------ | ----------------------------------------------------- |
| Rating moderation console      | 延後         | 出現實際 abuse case 且 moderation policy/command 核准 |
| Payment exception console      | 延後         | PSP 上線且現有 payments 頁不足                        |
| Fare anomaly triage console    | 延後         | 有可操作 recovery command                             |
| Authorization revoke/restore   | 延後         | Lifecycle、權限與 API 核准                            |
| Vehicle suspend/remove history | 延後         | API 與法遵流程核准                                    |
| Legal hold                     | 移出法規 MVP | 法務提出案件保存政策                                  |
| Export job orchestration       | 延後         | 實際資料量超過同步下載能力                            |
| 專用 queue 管理頁              | 不做         | 既有 dispatch 無法容納必要資訊                        |
| 新 design system               | 不做         | 無                                                    |
| 完整 Figma/PNG package         | 不做         | 契約明文要求                                          |

延後項目不得偷偷包進其他 Fleet PR。

---

# 7. 最小設計交付

設計只需交付 4 個 delta：

1. 既有 authorization 頁的欄位／動作調整；
2. 既有 dispatch list/detail 的兩個標籤與 denial copy；
3. 既有 passenger ride 的 rating/payment/receipt states；
4. records query/download 的單一 desktop flow。

可接受的交付媒介：

- 既有 Figma 檔中的增量 frame；
- 可點擊 code prototype；
- 清楚標註的現有 canvas 修改稿。

不強制指定 Figma，也不要求每個 loading/error state 各輸出 PNG。

每個 delta 必須提供：

- 使用者目標；
- 欄位與 canonical status mapping；
- 可執行 action；
- 一個正常狀態；
- 必要的 empty/error state；
- 最終繁體中文文案；
- 對應既有 route/component。

---

# 8. Design Definition of Done

最小設計只有在下列條件全部完成後，才可標記
`designReadyForImplementation = true`：

1. 4 個 UI delta 均有明確增量稿；
2. 沒有新增本文件第 6 節的延後功能；
3. 所有 action 均有現存或已核准 API command；
4. queue UI 沒有 legal bypass；
5. Passenger ride 不使用假評分、假付款或假證明；
6. records surface 包含全部法定欄位及查詢下載；
7. Product、System 與實作 owner 完成一次共同 review。

不以 Figma、PNG 數量或獨立 Design QA 文件判定完成。

---

# 9. Fleets Handoff

| UI delta        | Fleets task                                  |
| --------------- | -------------------------------------------- |
| `MTX-UI-MVP-01` | `MTX-AUTH-UI-001` verify/minimal delta       |
| `MTX-UI-MVP-02` | `MTX-QUEUE-003`                              |
| `MTX-UI-MVP-03` | `P5-PAX-WEB-001`、`P5-PAY-001`、`P5-RCT-001` |
| `MTX-UI-MVP-04` | `P5-RET-003`                                 |

`P5-RATE-003` moderation 不在法規 MVP，不能阻擋 Passenger rating 上線。

Implementation PR 只需連結相關 delta 與實際變更畫面，不得以「設計完整性」
為理由擴增本文件已延後的功能。
