# DRTS Phase 1 P-5／S-3 UI／UX 視覺設計團隊需求書

**文件版本**：v2.0  
**日期**：2026-07-20  
**適用團隊**：Product Design、UX、Visual Design、Content Design、Prototype、Design QA  
**Repo / Branch 參考**：`ajoe734/drts-fleet-platform` / `dev`  
**對應系統文件**：`01_system_development_team_spec_20260720.md`

---

# 0. 文件邊界

本文件只定義：

- 使用者旅程
- 資訊架構
- 畫面清單
- 視覺層級
- component inventory
- state variations
- interaction
- content / copy
- accessibility
- responsive
- prototype
- Figma handoff
- screenshot deliverables
- design QA

本文件不定義：

- database table
- API implementation
- transaction
- retry algorithm
- backend class/module
- SQL
- deployment
- automated test code

UI 團隊可引用系統文件中的欄位與狀態，但不得自行新增另一套命名。

---

# 1. 產品與品牌前提

## 1.1 服務名稱

```text
智行叫車
```

## 1.2 Runtime Profile

```text
multi_taxi_direct
```

## 1.3 禁止出現

所有 P-5／S-3 相關畫面不得出現：

```text
FSD
自駕
無人駕駛
安全員
接管
ROC
sandbox
Tesla
外部平台名稱
forwarded
mirror
native status
平台聚合切換器
外部平台 badge
```

不得以 CSS 隱藏既有多平台元件後交稿；Figma layer / component tree 也不應包含上述元件。

## 1.4 設計性格

- 安全、可信、正式。
- 不是科技 demo。
- 不是多平台工作台。
- 乘客端清楚易核對。
- 司機 SOS 端高對比、低認知負荷。
- Ops 端強調緊急性、責任歸屬及確認狀態。

---

# 2. 設計交付範圍

## 2.1 P-5 乘客端 Primary Screens

```text
P5-01 Awaiting Assignment
P5-02 Assigned — Rated Driver
P5-03 Assigned — New Driver
P5-04 Redispatch In Progress
P5-05 Redispatch Completed
P5-06 Driver Arrived
P5-07 In Trip + Seatbelt Reminder
P5-08 Completed + Rating Prompt
P5-09 Rating Submitted
P5-10 Electronic Ride Certificate
P5-11 Disclosure Unavailable / Fail Closed
P5-12 Contact Driver Not Provisioned
```

## 2.2 P-5 Supporting Screens

```text
P5-A01 Vehicle / Driver Disclosure Field Review
P5-A02 Incomplete Disclosure Correction Queue
P5-A03 Public Fare Version Page
P5-A04 Quote Temporarily Unavailable
P5-A05 Multi-Taxi Trip Record Export
```

## 2.3 S-3 Driver Primary Screens

```text
S3-01 Persistent SOS Entry in Active Trip
S3-02 Hold Progress
S3-03 Independent SOS Home
S3-04 Fleet Report Sending
S3-05 Fleet Report Submitted + Event No
S3-06 Offline Queued
S3-07 Supplement Form
S3-08 Attachment Upload / Retry
S3-09 False Alarm Slide Confirmation
S3-10 False Alarm Recorded
S3-11 Resolved / Closed
```

## 2.4 S-3 Ops Screens

```text
S3-O01 Critical Alert Overlay / Banner
S3-O02 SOS Queue
S3-O03 SOS Detail + Map
S3-O04 Acknowledged State
S3-O05 Investigation Timeline
S3-O06 Sound Disabled Health Warning
```

---

# 3. P-5 Passenger Experience

## 3.1 Page Architecture

Single-page ride surface：

```text
A. Header / Trip Status
B. Live Map / Pickup
C. ETA Hero
D. Statutory Vehicle + Driver Disclosure Card
E. Route + Fare Disclosure Card
F. Actions
G. Service / Safety Notice
```

### Priority

1. 車牌核對。
2. ETA／到達狀態。
3. 車輛與駕駛法定資訊。
4. 聯絡／取消。
5. 路線與價格。

---

## 3.2 Header

內容：

```text
智行叫車
行程狀態
訂單簡碼（非 raw database ID）
```

狀態 copy：

```text
正在安排車輛
車輛已指派
司機正在前往
司機已抵達
行程進行中
行程已完成
正在為您改派
行程已取消
```

不得顯示：

- source platform
- order domain
- mirror ID
- internal reason code

---

## 3.3 Map

Map minimum：

- current driver marker
- pickup marker
- route / approach line where available
- pickup address
- stale location state

Location states：

### Fresh

正常顯示 marker 與更新時間。

### Stale

顯示：

```text
司機位置更新稍有延遲
```

不得把舊 marker 當成即時而不提示。

### Missing

顯示 neutral map placeholder：

```text
正在取得司機位置
```

---

## 3.4 ETA Hero

視覺優先：

```text
預計 6 分鐘抵達
```

Secondary：

```text
約 14:35 抵達
```

ETA unavailable：

```text
抵達時間重新計算中
```

不得顯示 0 分鐘、NaN 或假資料。

---

# 4. P-5 法定派車資訊卡

## 4.1 Card Title

```text
您的車輛與駕駛
```

## 4.2 必須同畫面可見

### Vehicle

```text
廠牌＋車款
牌照號碼
出廠年份
車門數
車身顏色（輔助）
```

### Driver

```text
駕駛顯示名稱
執業登記證遮碼
有效狀態
有效期限（detail or inline）
乘車評價
```

### Rating

Rated：

```text
4.9 ★
328 則評價
```

New Driver：

```text
新進駕駛
尚無乘車評價
```

Unavailable：

不可以假裝新駕駛；本狀態應由系統 fail closed，不應進 assigned production screen。

---

## 4.3 Plate Visual Rule

車牌是乘客上車核對的第一辨識欄位。

要求：

- 卡片中最大文字之一。
- monospaced or high-legibility numerals。
- 與背景對比至少 4.5:1。
- 不用 decorative license plate mockup 影響閱讀。
- 可使用 subtle border，不模仿政府正式牌照到容易混淆。

---

## 4.4 Registration Badge

Badge：

```text
執登有效
```

Detail：

```text
北市計字第12***67號
有效至 2027/12/31
```

禁止：

- 綠勾但無證號。
- 只寫「已驗證」不說是執登。
- 顯示完整證號。
- expired credential 使用綠色。

---

# 5. Route／Fare Disclosure Card

Title：

```text
預估路線與車資
```

內容：

```text
上車地
下車地
預估行駛距離
預估時間
預估／應付車資
計價方式
車資變更規則
```

Example：

```text
預估車資 NT$ 320–380
依計費表實際金額收費

若乘客要求變更目的地、增加停靠點，或因依法需支付通行費，
實際車資可能調整。
```

固定報價：

```text
本趟應付 NT$ 850
```

Quote anomaly：

```text
目前無法取得正式報價
請稍後重試或聯絡客服
```

不得用 `NT$ --` 搭配可按確認。

---

# 6. P-5 Actions

## 6.1 Contact Driver

Button：

```text
聯絡司機
```

Loading：

```text
正在建立安全通話
```

Not provisioned：

```text
目前無法直接聯絡司機
請改聯絡客服
```

不得顯示 raw phone。

## 6.2 Cancel

Button：

```text
取消行程
```

免費窗口：

```text
2:15 內取消不收費
```

需收費：

```text
取消可能產生 NT$ 80 費用
```

Confirm modal 必須清楚顯示結果。

---

# 7. Redispatch Experience

## 7.1 Redispatching

Page state：

```text
正在為您安排另一輛車
```

- 不應短暫顯示兩台車。
- 舊車卡視覺進入 disabled / replacement state。
- Actions 依 available actions 調整。

## 7.2 Completed

新卡：

```text
已為您改派新的車輛
```

- 明確 highlight 車牌改變。
- 不必顯示舊車完整個資。
- 可以顯示 neutral activity：
  ```text
  14:31 已完成改派
  ```

## 7.3 Version Safety UX

若前端收到舊 version：

- 不畫面倒退。
- 不顯示 flash。
- 可 silently ignore。
- logging 交給 system，不需要告知一般乘客。

---

# 8. Seatbelt Reminder

Trigger：司機抵達／行程開始。

Presentation：

- dismissible banner or full-width card。
- icon + concise copy。
- 不用危險紅，除非情境需要；建議 safety amber / primary。

Copy：

```text
上車後請全程繫妥安全帶
前後座乘客都需要繫安全帶。
```

需可被 screen reader 朗讀。

---

# 9. Post-Trip Rating

## 9.1 Rating Prompt

Title：

```text
這趟服務如何？
```

- 1–5 stars。
- 星星 hit target ≥44×44。
- 選擇後顯示文字標籤。

Suggested labels：

```text
1 非常不滿意
2 不滿意
3 普通
4 滿意
5 非常滿意
```

Optional tags：

```text
準時抵達
駕駛有禮
車內整潔
行車平穩
路線適當
```

低評分可顯示：

```text
需要客服協助嗎？
```

但不要強迫建立申訴。

## 9.2 Submitted

```text
感謝您的評價
```

不得顯示 aggregate 立即變更的假動畫，除非 backend 已回新版本。

---

# 10. Electronic Ride Certificate

IA：

```text
電子乘車證明
車牌
上下車時間
行駛時間
起訖地
行駛里程
車資
通行費
客服電話
主管機關申訴電話
```

Actions：

```text
下載 PDF
分享
返回行程
```

敏感資料遮碼。

---

# 11. P-5 Loading / Error / Empty States

## Loading

使用 skeleton；不得先顯示 fixture。

## Disclosure Unavailable

```text
派車資訊尚未完整
系統正在重新確認車輛與駕駛資料，尚未完成指派。
```

Actions：

```text
重新整理
聯絡客服
```

不得顯示半套 assigned card。

## Rating Service Error

```text
評價資料暫時無法載入
```

此狀況在正式 assignment 前應被 backend block；如果發生於 legacy read，畫面需明確標示，不顯示 5.0。

---

# 12. S-3 Driver Experience

## 12.1 Persistent Entry

在 active trip 狀態常駐：

```text
SOS
```

Placement：

- reachable with one thumb。
- 避免與「完成行程」相鄰造成誤觸。
- 不應藏入 three-dot menu。

## 12.2 Press and Hold

- 按住 2 秒。
- haptic feedback。
- circular progress。
- short press copy：
  ```text
  請長按 2 秒啟動 SOS
  ```
- 放開未滿 2 秒不送出。

---

# 13. Independent SOS Home

全螢幕獨立頁，不露出原工作台。

## 13.1 Header

```text
SOS 緊急通報
```

Secondary：

```text
需要立即協助時，請選擇下列方式
```

## 13.2 Three Primary Actions

Order：

1. 撥打 110
2. 撥打 119
3. 通報車隊值班

### 110

Copy：

```text
撥打 110
警察協助
```

### 119

```text
撥打 119
消防／救護
```

### Fleet

```text
通報車隊值班
建立緊急事件並通知值班人員
```

Visual：

- 110 / 119 使用 emergency red family。
- fleet report 使用 high-emphasis brand／critical action，但與 native dial 可辨識。
- 三個按鈕皆 ≥56px high。
- icon + text，不依顏色判斷。

---

# 14. S-3 Auto Context Card

Title：

```text
將自動附帶
```

Fields：

```text
行程編號
車牌
駕駛
目前位置
原始觸發時間
```

States：

### Available

顯示值。

### Location resolving

```text
正在取得定位
```

### No active trip

```text
目前沒有進行中的行程
仍可通報車隊，系統會附上駕駛與裝置位置。
```

不得顯示：

- platform code
- external order
- mirror order
- native status

---

# 15. S-3 Sending / Submitted / Offline

## Sending

```text
正在通報車隊值班
請保持此頁開啟
```

## Submitted

```text
車隊已收到通報
事件編號 SOS-20260720-0012
```

Secondary：

```text
值班人員將優先處理
```

Actions：

```text
補充事件資訊
查看通報狀態
```

## Offline Queued

```text
目前無網路，通報已保存在手機
恢復連線後會自動送出
```

Must still show：

```text
撥打 110
撥打 119
```

Status chip：

```text
等待補送
```

不得誤寫「車隊已收到」。

---

# 16. S-3 Supplement Form

Fields：

```text
事件類型
嚴重度
文字說明
照片
語音
```

Event types：

```text
交通事故
治安事件
乘客急病
其他
```

Severity：

```text
重大
一般
```

Locked fields：

```text
位置
原始觸發時間
行程
車牌
駕駛
```

Locked fields visually read-only, not disabled gray to unreadable。

---

# 17. Attachments

## Photo

- multiple thumbnail grid。
- upload progress。
- retry per item。
- remove before confirmed upload。
- after confirmed, removal follows system permission。

## Audio

- record button。
- elapsed time。
- max 5 minutes indicator。
- playback before upload。
- permission denied state。

## Retry

```text
上傳失敗
[重試]
```

不要阻擋 metadata SOS submission。

---

# 18. False Alarm

Entry：

```text
誤觸？滑動解除
```

Interaction：

- slide-to-confirm。
- second confirmation copy：
  ```text
  確定是誤觸嗎？
  事件紀錄仍會保留，值班端也會收到誤觸狀態。
  ```

Completed：

```text
已回報為誤觸
```

不要使用「刪除事件」。

---

# 19. Ops Critical Alert

## 19.1 Alert Overlay

必須包含：

```text
SOS event number
elapsed time
driver
plate
order
location
severity/type if available
acknowledge button
open detail button
```

Visual：

- persistent。
- critical hierarchy。
- 不依 toast，不能自動消失。
- sound state indicator。

## 19.2 Acknowledged

```text
已由 王小明 於 14:31 確認
```

其他 operator 不再顯示 primary acknowledge button。

## 19.3 Sound Disabled

```text
SOS 提示音尚未啟用
請點此啟用瀏覽器提示音
```

不可只依聲音，不可只有視覺。

---

# 20. SOS Queue / Detail

Queue columns：

```text
事件編號
狀態
等待時間
駕駛
車牌
行程
位置
事件類型
值班確認人
```

Detail：

```text
critical summary
map
auto context
driver supplements
attachments
SOS timeline
linked incident
actions
```

Timeline labels：

```text
駕駛啟動 SOS
駕駛確認通報車隊
系統收到通報
已通知值班端
值班人員已確認
駕駛補充資訊
附件已上傳
駕駛回報誤觸
開始調查
已處理
已結案
```

---

# 21. Back-Office Visual Updates

UI 團隊不需重設整個 Fleet / Platform Admin，但需補：

## 21.1 Vehicle Fields

```text
廠牌
車款
出廠年份
車門數
車身顏色
```

## 21.2 Driver Credential

```text
執業登記證號
區域
效期
審核狀態
乘客顯示預覽
```

## 21.3 Correction Queue

Rows：

```text
車行
車牌／駕駛
缺漏欄位
目前狀態
送審日期
最後更新
```

Actions：

```text
查看
退件補正
核准
```

## 21.4 Fare Version

```text
草稿
已備查
已生效
已停用
```

需要 effective date / public preview。

---

# 22. Component Inventory

## P-5

```text
RideStatusHeader
LiveMapCard
EtaHero
VehicleIdentityCard
DriverCredentialBadge
DriverRatingDisplay
RouteFareDisclosureCard
CancelWindowIndicator
ContactDriverButton
SeatbeltReminder
RatingInput
ElectronicRideCertificate
DisclosureErrorState
```

## S-3 Driver

```text
PersistentSosEntry
HoldToActivateButton
EmergencyDialButton
FleetReportButton
SosContextCard
SosDeliveryStatus
AttachmentUploader
AudioRecorder
FalseAlarmSlider
SosTimeline
```

## S-3 Ops

```text
CriticalSosAlert
SosSoundHealth
SosQueueTable
SosAcknowledgementChip
SosMapPanel
SosTimelinePanel
```

Components must use Auto Layout and variants。

---

# 23. Design Tokens

沿用現有 DRTS design system，不另建 P-5／S-3 私有色票。

Minimum semantic tokens：

```text
surface/default
surface/elevated
text/primary
text/secondary
border/default
brand/primary
status/success
status/warning
status/danger
status/info
focus/ring
```

Critical red 不得用於普通 ETA／取消倒數。

---

# 24. Accessibility

- WCAG AA contrast。
- hit target ≥44×44。
- 車牌、ETA、SOS actions 支援 Dynamic Type。
- screen reader labels。
- Map 有文字替代。
- SOS 不只靠顏色。
- Rating star 有數字與文字 label。
- progress / upload 有 accessibility value。
- reduced motion variant。
- critical sound 有 visual equivalent。

---

# 25. Responsive / Device Targets

## Passenger Web

Primary：

```text
390 × 844
393 × 852
360 × 800
```

Also：

- 320px narrow。
- tablet WebView。
- browser zoom 200%。

## Driver App

Primary：

```text
iPhone 6.1"
Android 360 × 800
Android 412 × 915
```

Safe-area aware。

## Ops

Desktop：

```text
1440 × 900
1280 × 800
```

Critical overlay 不遮住 acknowledgement action。

---

# 26. Content Rules

## Terminology

Use：

```text
智行叫車
車輛已指派
執登有效
乘車評價
預估路線與車資
通報車隊值班
事件編號
等待補送
值班人員已確認
```

Do not use：

```text
合規快照
canonical
assignment version
provider
mirror order
native status
outbox
hard block
```

Internal terms stay out of user-facing copy。

---

# 27. Sample Data

使用虛構資料：

```text
Vehicle: Toyota Corolla Altis
Plate: BKR-2208
Model year: 2024
Doors: 4
Color: 珍珠白

Driver: 吳明翰
Registration: 北市計字第12***67號
Valid until: 2027/12/31
Rating: 4.9 / 328
ETA: 6 minutes
Fare: NT$ 320–380
```

SOS：

```text
Event: SOS-20260720-0012
Order: ZX-240720-0186
Plate: BKR-2208
Driver: 吳明翰
Location: 臺北市信義區松仁路 100 號附近
Triggered: 2026/07/20 14:30:12
```

不得使用真實個資。

---

# 28. Figma Structure

Page names：

```text
00_Cover
01_P5_Passenger
02_P5_PostTrip
03_P5_BackOffice
04_S3_Driver
05_S3_Ops
06_Components
07_Prototype
08_Handoff
```

Frame naming：

```text
P5-02_Assigned_Rated_390x844
P5-05_Redispatch_Completed_390x844
S3-03_SOS_Home_iPhone
S3-O01_Critical_Alert_1440
```

Each frame includes:

- state code
- device
- data case
- source status (live / fixture / design-only)

---

# 29. Prototype Flows

## P-5

```text
awaiting
→ assigned
→ contact
→ redispatching
→ redispatch complete
→ arrived
→ seatbelt reminder
→ completed
→ rating
→ receipt
```

## S-3

```text
active trip
→ hold 2 sec
→ SOS home
→ call 110 / 119
OR
→ fleet report
→ submitted / offline
→ supplement
→ false alarm
```

## Ops

```text
critical alert
→ acknowledge
→ detail
→ investigation
→ resolve
```

---

# 30. Visual Design Deliverables

Required：

1. Figma source with editable components。
2. component variants。
3. prototype links。
4. responsive frames。
5. copy deck。
6. state matrix。
7. accessibility annotations。
8. developer handoff annotations。
9. PNG screenshots。
10. design QA checklist。

Final screenshots：

```text
P5_dispatch_disclosure.png
S3_sos_fullscreen.png
```

P-5 screenshot must include：

- make/model
- plate
- year
- doors
- driver name
- registration valid display
- rating / new-driver state
- ETA / map
- route / fare summary

S-3 screenshot must include：

- independent full screen
- 110
- 119
- fleet report
- order
- plate
- driver
- GPS / address
- no forbidden content

---

# 31. UI Definition of Done

P-5：

1. all statutory fields visually present and legible。
2. no fake rating。
3. redispatch states complete。
4. route/fare and fare-change copy complete。
5. loading / stale / unavailable states complete。
6. contact driver never reveals raw phone。
7. post-trip rating and receipt complete。
8. reservation-only terminology。
9. no external-platform / AV elements。
10. accessibility annotations complete。

S-3：

1. independent full-screen SOS。
2. 2-second hold interaction prototyped。
3. 110 / 119 / fleet actions visually distinct。
4. online / sending / submitted / offline states。
5. event number visible。
6. supplement / attachments / retry。
7. false-alarm interaction。
8. Ops critical / ack / sound-disabled states。
9. no multi-platform / AV elements。
10. final screenshots pass forbidden-word scan。
