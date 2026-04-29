# Phase 1 營運級 SA 缺口補充說明

狀態：supplemental SA addendum  
日期：2026-04-29  
適用範圍：`drts-fleet-platform`、`tenant-commute-hub`

## 1. 文件目的

本文件補充 `phase1_system_analysis_v1.md` 尚未收斂的營運級系統分析缺口。

既有 SA 已經定義：

- Phase 1 / Phase 2 邊界
- 產品桶與訂單域
- 角色責任與主要 domain
- 合規、財務、申訴、forwarder、報表等大方向

但在實際程式盤點後可以確認，以下幾類問題仍未被完整收成可操作的 SA 閉環：

- 人員與裝置如何進入系統
- 新租戶 / 新司機 / 新合作方如何開通
- 電話、合作方、第三方 API 訂單如何進單與進待派
- 調度員如何在日常操作中派遣、重派、處理例外
- 地圖、即時供給、錄音合規、partner eligibility 等操作責任如何落地

本文件的角色不是推翻既有 SA，而是把「domain/API 已存在，但 operation-level SA 尚未閉環」的缺口明確列出，作為後續 PRD、SD、畫面設計、runbook 與 backlog 補完依據。

## 2. 核心判斷

### 2.1 已做好的部分

目前 repo 已具備下列高成熟度能力：

- 核心 API domain 邊界已建立
- 平台管理後台、營運後台、司機 App、租戶入口、合作方入口皆有實體
- tenant / partner booking、billing、reporting、webhook、API key、audit 等基礎能力可用
- 電話訂單、dispatch job、driver task、redispatch、reporting、settlement 等主流程已有後端實作

### 2.2 尚未閉環的部分

目前缺口主要不是「完全沒做功能」，而是「營運級閉環沒有被正式系統分析完整定義」。

最明顯的缺口類型：

- 主檔建立流程存在 API 或 seed，但缺少正式後台操作流程
- 身份進入流程存在 dev/internal 方式，但缺少 production-grade lifecycle
- 調度流程存在 list-and-assign 模型，但缺少 map-driven 與例外處理工作台
- 合作方模型存在，但缺少正式 onboarding 與 external integration 開通流程

### 2.3 系統性結論

本專案目前比較接近：

- `Domain-complete but operations-partially-productized`

而不是：

- `From-scratch prototype`

因此補完方向應聚焦在營運閉環，而非重做整體 bounded context。

## 3. 缺口分類總覽

| 類別 | 現況 | 主要風險 | 建議優先級 |
| --- | --- | --- | --- |
| 身份與入口 | 有 bootstrap / env / API key / tenant session，但多處仍是半產品化 | 人員無法穩定入場，權限生命週期不完整 | P0 |
| 主檔與開通 | 司機、合作方、第三方合作方多依 seed / persistence / 分散 UI | 新客戶、新司機、新方案難以複製開通 | P0 |
| 進單與待派 | tenant/partner 成熟，phone/API/forwarder 流程不對稱 | 真實營運渠道進單不一致 | P0 |
| 調度操作 | candidate list + assign 可用，但非完整調度台 | 派遣效率與例外處理能力不足 | P0 |
| 地圖與即時可視化 | 有 MapPicker 雛形，但未整合主流程 | 調度與客服缺乏空間視角 | P1 |
| 合規閉環 | recording / proof / eligibility 有欄位與狀態 | 實務責任分工與阻擋規則不清 | P0 |
| 財務結算閉環 | 報表與結算存在，但跨渠道商業規則未全明文化 | 後續對帳與審計成本偏高 | P1 |
| 角色分工與 runbook | 角色存在，操作責任未系統化 | 系統可用但現場難落地 | P0 |

## 4. 詳細缺口盤點

### 4.1 司機身份與裝置進入流程

#### 現況

- `apps/driver-app` 啟動時依賴 `EXPO_PUBLIC_DRIVER_ID`、`EXPO_PUBLIC_DRIVER_ACTOR_ID` 或 `expo.extra.driverActorId`
- 未配置 driver identity 時，App 進入「裝置尚未配置」降級頁
- runbook 已描述未來 production 方案應改為 device registration + backend identity handoff

#### 缺口

- 沒有 production-grade driver login / device-binding flow
- 沒有換機、遺失裝置、停權、重新發放 token 流程
- 沒有平台管理端可操作的裝置綁定 UI

#### SA 應補內容

- 司機身份生命週期
- 裝置註冊與解除註冊流程
- driver actor 與 device token 關係
- driver app 失效處理與重新啟用規則

#### 建議優先級

`P0`

### 4.2 司機主檔建立與營運主檔流程

#### 現況

- `regulatory-registry` 保存司機可派資格與工作狀態
- `driver-profile` 保存個人聯絡、緊急聯絡人、銀行帳戶遮罩資訊
- 兩者目前未整合成單一後台 onboarding flow

#### 缺口

- 平台管理員如何新增新司機
- 司機何時可被派單
- 司機與車輛、身份、裝置如何關聯
- 停權、離職、換車、換機如何處理

#### SA 應補內容

- 司機主檔 source-of-truth
- 司機狀態流：draft / active / suspended / archived
- 司機與車輛、班次、裝置、法規文件的關聯

#### 建議優先級

`P0`

### 4.3 合作方 / 銀行方案開通流程

#### 現況

- `tenant-partner` 已具備 partner entry、eligibility verification、partner API ingress 模型
- demo partner / bank entries 目前以 seed / persistence 形式存在
- `tenant-commute-hub` 已支援 partner booking funnel 與 branding

#### 缺口

- 如何建立新的 partner program / bank entry
- 如何核准新的入口 slug、branding、eligibility mode
- 如何發給合作方 API key 與 sandbox 資訊
- 如何做上線驗證與回滾

#### SA 應補內容

- partner onboarding lifecycle
- bank-card airport transfer program lifecycle
- partner credential issuance / rotation / revoke policy
- partner sandbox / staging / production promotion gate

#### 建議優先級

`P0`

### 4.4 第三方 APP / 第三方平台 API 合作接入

#### 現況

- tenant API key / webhook 模型已成熟
- `forwarder` 有 adapter / broadcast / accept / sync-status 骨架

#### 缺口

- 缺少標準第三方接入模式說明
- 缺少合作模式分類：tenant-side integration vs external ride platform
- 缺少 API versioning、error contract、SLA、retry、對帳責任界線

#### SA 應補內容

- 第三方合作模式矩陣
- auth contract 選型規則
- inbound order / outbound callback / settlement / dispute owner

#### 建議優先級

`P1`

### 4.5 電話進單與 Call Center 操作閉環

#### 現況

- `callcenter` 支援 call session、ETA quote、callback、錄音 callback、轉客訴
- `owned-mobility` 支援 `POST /call-center/orders`
- phone order 可建立為 `orderSource: "phone"`，並在錄音條件滿足時進 `ready_for_dispatch`

#### 缺口

- 未見完整 call-taker 建單 UI 與欄位工作流
- 未見 CTI / screen-pop / 來電即建單體驗
- 未明文化 recording pending 的操作責任

#### SA 應補內容

- Call center from call to dispatch 的完整話務流程
- 建單欄位責任、錄音阻擋條件、補件規則
- call-taker 與 dispatcher 是否同角色情境

#### 建議優先級

`P0`

### 4.6 待派清單與調度佇列規則

#### 現況

- standard taxi、phone order、tenant booking、partner booking 都可能形成可派單
- `dispatch-workflow` 目前以表格、queue state、candidate list 展示

#### 缺口

- 哪些單何時正式進待派
- reservation 與 realtime 單如何共用或分開佇列
- exception hold / redispatch required / recording pending 的責任邊界

#### SA 應補內容

- queue entry policy
- reservation vs realtime 佇列規則
- queue priority 與 escalation 規則

#### 建議優先級

`P0`

### 4.7 派遣、重派與人工 override 流程

#### 現況

- `dispatchOrder` 會建立 dispatch job / attempt
- `listDispatchCandidates` 由 `regulatory-registry` 回傳 vehicle/driver/eta 候選
- `assignDispatch` 建立 assignment 與 driver task
- `redispatchOrder` 會取消現有 assignment 並重新自動 dispatch

#### 缺口

- 缺少明文化的人工作業規則
- 缺少 bulk dispatch、人工 override、派車原因註記規則
- 缺少明確的 reassign 與 redispatch 差異說明

#### SA 應補內容

- Dispatch operation model
- 派遣、重派、取消派遣、改派的明確術語
- dispatch attempt、assignment、driver task 三者關係圖

#### 建議優先級

`P0`

### 4.8 地圖、即時位置與空間視角

#### 現況

- `tenant-commute-hub` 有 `MapPicker` 元件，但未接入 booking 主流程
- `ops-console-web` dispatch 目前不是 map-driven
- 候選供給主要依 registry + ETA 計算

#### 缺口

- 缺少 dispatch map board
- 缺少客服 / 租戶端地圖選點標準流程
- 缺少即時車輛位置與空間熱區展示

#### SA 應補內容

- 哪些角色需要地圖視角
- 地圖僅輔助輸入，或成為核心 dispatch board
- 即時位置 refresh 與 ETA 準確度要求

#### 建議優先級

`P1`

### 4.9 錄音、proof、eligibility 的合規阻擋規則

#### 現況

- phone order 有 `recording_pending` / `recording_bound`
- booking / trip 有 proof requirement 欄位
- partner booking 有 eligibility verification

#### 缺口

- 哪些情況阻擋派遣
- 哪些情況允許人工 override
- 失敗後誰補件、誰審核、誰結案

#### SA 應補內容

- compliance gate matrix
- proof review ownership
- partner eligibility exception handling

#### 建議優先級

`P0`

### 4.10 財務、結算與對帳閉環

#### 現況

- tenant invoices、driver statements、reimbursements、revenue summary、report jobs、filing packages 已存在
- partner truth 已開始 carry-through 到 billing/reporting

#### 缺口

- 不同進單渠道的財務歸屬規則未完整收斂
- 第三方平台 / partner benefit / call center 單的對帳責任未在 SA 中清楚展開

#### SA 應補內容

- channel-to-settlement matrix
- 誰對誰結算、誰對誰開票、誰承擔例外成本

#### 建議優先級

`P1`

### 4.11 角色責任與 runbook 缺口

#### 現況

- 系統已有平台管理員、租戶、ops、driver、partner 等角色概念
- 但操作責任多散落於頁面與 service 行為

#### 缺口

- 缺少 RACI 式責任矩陣
- 缺少誰負責開通、派遣、補件、審核、停權的完整說明

#### SA 應補內容

- 角色責任矩陣
- 日常營運 runbook 入口
- 異常情境交接規則

#### 建議優先級

`P0`

### 4.12 租戶開通與 production rollout 缺口

#### 現況

- `platform-admin-web` 已有 tenant 管理頁面
- `tenant-commute-hub` 已可作為正式 tenant UI
- API 與 BFF 邊界已大致收斂

#### 缺口

- 新 tenant 的標準開通流程未完整明文化
- tenant 建立後需要哪些預設資料、角色、地址、通知、webhook、billing profile，未收成 checklist
- tenant 從 sandbox / pilot / production 的 promotion gate 未明文化

#### SA 應補內容

- tenant onboarding checklist
- tenant cutover / rollback model
- tenant default data bootstrap policy

#### 建議優先級

`P0`

### 4.13 供給池建立與維護缺口

#### 現況

- `regulatory-registry` 已管理 vehicles、drivers、contracts、insurance、exclusivity、latest driver locations
- dispatch eligibility 依上述資料做即時判斷

#### 缺口

- 車輛、司機、契約、保險、排他委託建立流程缺少統一後台與狀態流
- 供給池資料變更後如何影響既有 dispatch / reservation，未被完整定義
- latest driver location 的更新頻率、保留策略、失效策略未明文化

#### SA 應補內容

- supply registry lifecycle
- contract / insurance / exclusivity expiry handling
- supply invalidation impact matrix

#### 建議優先級

`P0`

### 4.14 預約單與即時單規則缺口

#### 現況

- `standard_taxi` 多為 realtime
- `business_dispatch` 多為 reservation
- 系統已存在 confirmation window、modifiableUntil、cancelableUntil、reservation hold 欄位

#### 缺口

- reservation hold 的人工處理規則未明文化
- 預約單臨近出發時間時，何時進待派、何時轉 exception hold 未完整展開
- 即時單與預約單混排時的 SLA 與優先權未清楚定義

#### SA 應補內容

- reservation orchestration model
- hold / confirm / release / fail 狀態圖
- realtime vs reservation dispatch priority matrix

#### 建議優先級

`P0`

### 4.15 乘客、地址與企業用戶主檔缺口

#### 現況

- tenant passenger、tenant address、tenant users 已有 API 與 UI
- 資料結構已可支援 booking flow

#### 缺口

- passenger 與 employee / cardholder / VIP 身份的關聯規則未清楚定義
- 地址正規化、重複檢查、黑名單地址、敏感地址遮罩規則未明文化
- passenger/address 與 partner program eligibility 的交互規則未完整定義

#### SA 應補內容

- passenger master data model
- address quality / geocode / masking rules
- tenant roster governance

#### 建議優先級

`P1`

### 4.16 產品規則與價格權威缺口

#### 現況

- `product-rule` 模組存在
- booking 已支援 `quotedFare`、`fixedPrice`、proof requirement 等欄位
- tenant portal 已明確不再自行做價格 authority

#### 缺口

- 價格試算來源、版本切換、例外人工覆寫規則未完整展開
- partner / bank / enterprise dispatch 的價格責任與費用歸屬規則未完整明文化
- meter vs fixed price 的營運轉換規則未明文化

#### SA 應補內容

- pricing source-of-truth
- quotedFare lifecycle
- fare override governance

#### 建議優先級

`P1`

### 4.17 申訴、事故與客服升級路徑缺口

#### 現況

- complaint、incident、callcenter 均已存在
- 可由 call session 轉 complaint case

#### 缺口

- complaint 與 incident 的邊界未對現場角色明文化
- 司機事件、乘客申訴、合作方爭議的分流規則未完整說明
- escalation / SLA / ownership 仍偏隱含在模組中

#### SA 應補內容

- service recovery model
- complaint vs incident taxonomy
- escalation ownership matrix

#### 建議優先級

`P1`

### 4.18 Forwarder / 多平台合作營運缺口

#### 現況

- `forwarder` 模組已具備 adapter 概念與主要路由
- driver app 已有 `sourcePlatform` 與 route-locked 類展示

#### 缺口

- forwarded order 不同於 owned order 的營運規則未完整產品化
- 多平台單的接單、退單、狀態同步、補償責任未在 SA 中清楚展開
- forwarder adapter SLA、timeout、manual fallback、對帳責任未明文化

#### SA 應補內容

- forwarded order operating model
- adapter failure playbook
- external platform reconciliation model

#### 本輪補齊內容

- forwarded order 現在明確區分 `orderDomain=forwarded` 與 `dispatchSemantics=forwarder_broadcast`
- driver accept relay 失敗會落成 `sync_failed`，並持久化 sync error、adapter health、manual fallback、reconciliation job
- manual fallback 需具名記錄 reason / requestedBy / notes，不再是隱含人工流程
- native status sync 與人工 reconciliation completion 都可關閉 queued reconciliation job，並解除 fallback flag
- finance authority 明定為 external platform；本地帳務只保留 `shadow_only` projection 供對帳與報表使用

#### 尚存風險

- adapter timeout 門檻、重試次數、告警升級時間窗仍需後續 non-functional 任務量化
- 多平台對帳批次排程與跨日差異處理目前仍停留在單筆 reconciliation job 模型

#### 建議優先級

`P1`

### 4.19 Partner eligibility 真實串接缺口

#### 現況

- 目前 `bank_card_inline` 與 `reference_required` 已有 demo verification logic
- partner eligibility record 會被持久化並帶入 downstream

#### 缺口

- 真實 issuer / bank / concierge API contract 未落地
- 風控、重試、timeout、人工覆核、爭議回放策略未明文化
- eligibility token / reference 的保存與敏感資料治理未完整展開

#### SA 應補內容

- issuer integration contract
- eligibility verification fallback model
- sensitive token handling policy

#### 建議優先級

`P0`

### 4.20 租戶 API / webhook 營運治理缺口

#### 現況

- tenant API key、rotate、revoke、webhook create/update/delete/test 均已存在
- webhook delivery 與 notification feed 也已存在

#### 缺口

- API key 命名、scope policy、rotation cadence、break-glass 規則未明文化
- webhook failure 後的通知、重試、停用條件未完整產品化
- tenant integration onboarding package 未形成標準交付

#### SA 應補內容

- integration governance model
- webhook reliability contract
- tenant developer onboarding packet

#### 建議優先級

`P1`

### 4.21 內部控制平面與業務平面邊界缺口

#### 現況

- 內部 control-plane IAP/OIDC 已有分層拓樸
- tenant / driver / partner 路徑不預設走同一 IAP 邊界

#### 缺口

- 不同平面的 session、token、header、caller assumption 尚未在同一 SA 視圖中統一說明
- 內部 admin / ops 與外部 tenant / partner / driver auth policy 尚未形成操作級矩陣

#### SA 應補內容

- plane separation auth matrix
- realm-by-realm auth topology
- inner token / outer identity handoff rules

#### 建議優先級

`P0`

### 4.22 資料權威與雙 repo 漂移風險缺口

#### 現況

- 已明確定義 `drts-fleet-platform` 為 authority，`tenant-commute-hub` 為 UI consumer
- 歷史上的 split authority 已大致收斂

#### 缺口

- cross-repo contract drift 預防機制仍不足
- shared snapshot / generated shim 的同步節奏與破壞性變更流程未明文化
- tenant repo 若臨時增加 local workaround，缺少正式治理規則

#### SA 應補內容

- cross-repo contract management model
- compatibility / deprecation policy
- anti-authority-drift guardrail

#### 建議優先級

`P0`

### 4.23 測試、驗證與 acceptance 閉環缺口

#### 現況

- repo 內已有 unit test、runbook、UAT、e2e matrix、sidecar acceptance 紀錄
- 關鍵路徑已有部分 code-backed 驗證

#### 缺口

- 真實營運 happy path 多為跨 repo / 跨 surface，尚未形成穩定全鏈路驗證
- 新銀行 / 第三方 / call center / dispatch / driver 完整鏈路的 automated acceptance 仍不足
- 一些 completion claim 仍依 closeout narrative，多於固定 regression pack

#### SA 應補內容

- end-to-end verification matrix by channel
- operational acceptance contract
- release gate by workflow family

#### 建議優先級

`P0`

### 4.24 觀測性、告警與營運可見性缺口

#### 現況

- 系統內已有 audit、notification、reporting、health 類能力
- 但多偏業務紀錄，不等於完整 observability

#### 缺口

- 缺少明文化的 metrics / logs / traces / alerts 要求
- dispatch lag、webhook failure、eligibility failure、driver offline、recording missing 等告警未形成操作標準
- 缺少值班人員看的統一 operational health 視圖

#### SA 應補內容

- observability minimum bar
- alert taxonomy
- operational dashboards by role

#### 建議優先級

`P1`

### 4.25 非功能需求與容量假設缺口

#### 現況

- 架構層已提到 PostgreSQL、Redis、object storage 等
- 但 Phase 1 操作級容量假設未系統化列出

#### 缺口

- 尖峰進單量、同時待派單量、driver heartbeat 頻率、webhook fan-out、report generation 量級未明文化
- 沒有把 SLA / latency / durability / retention 與每個流程綁起來

#### SA 應補內容

- workload assumptions
- latency / availability / retention targets
- operational degradation policy

#### 建議優先級

`P1`

### 4.26 資安與敏感資料治理缺口

#### 現況

- auth、JWT、internal key、masked bank account、signed download 等已有部分安全設計

#### 缺口

- PII / payment-ish / partner reference / recording URL 等敏感資料分類未形成統一治理表
- 前後台顯示遮罩、匯出遮罩、下載授權、稽核保留週期未完全統一
- mobile token、partner API key、tenant API key 的 secret storage 策略未在 SA 中完整展開

#### SA 應補內容

- data classification matrix
- masking / export / download control policy
- secret management policy

#### 建議優先級

`P0`

### 4.27 歷程、留存與法規保留缺口

#### 現況

- audit、dispatch trace、recording linkage、reporting artifacts 已存在

#### 缺口

- 各類紀錄保留多久、何時封存、何時可刪、誰可調閱未形成系統化規則
- call recording、driver proof、webhook delivery、eligibility verification 的 retention policy 未統一

#### SA 應補內容

- retention and archival policy
- evidentiary access rules
- deletion / legal hold model

#### 建議優先級

`P1`

### 4.28 國際化與多語營運缺口

#### 現況

- partner funnel 已要求 Traditional Chinese ready
- 其他不少畫面仍混合中英文

#### 缺口

- 不同角色與渠道的語言準則未統一
- operator、tenant、partner、driver 各面 copy readiness 不一致
- error code 與 user-facing copy 的對齊未全數收斂

#### SA 應補內容

- language policy by surface
- translation ownership
- operational terminology glossary

#### 建議優先級

`P2`

### 4.29 文件、決策與 backlog 同步缺口

#### 現況

- repo 中有大量 blueprint、decision packet、runbook、closeout 文檔

#### 缺口

- 決策與實作收斂速度不一致，容易形成「文件說有、程式半套」或反向情況
- 補完 backlog 若未進 current-work / execution board，容易再次散失

#### SA 應補內容

- decision-to-implementation sync rule
- SA supplement to backlog workflow
- owner / due-date / evidence expectations

#### 建議優先級

`P0`

## 5. 建議補完 backlog

### 5.1 P0 必補

1. 司機身份與裝置綁定正式流程
2. 司機主檔與 onboarding 後台
3. partner / bank entry 開通後台與 lifecycle
4. call center 建單 UI 與話務閉環
5. 待派佇列規則與 dispatch 操作模型
6. compliance gate matrix
7. 角色責任矩陣與 runbook 對齊
8. tenant onboarding checklist 與 rollout gate
9. plane separation auth matrix
10. cross-repo contract / authority drift guardrail
11. end-to-end verification matrix
12. data classification / masking / secret policy
13. issuer / bank eligibility 真實串接策略
14. reservation orchestration model
15. decision-to-backlog sync rule

### 5.2 P1 應補

1. 第三方 APP / ride platform 標準合作模式
2. 地圖與即時位置操作視角
3. channel-to-settlement / reconciliation matrix
4. bulk dispatch / richer override / map board 升級需求
5. supply registry lifecycle
6. observability minimum bar
7. non-functional workload / SLA / retention targets
8. complaint / incident / service recovery taxonomy
9. tenant integration onboarding packet
10. archival / legal hold / evidence access policy

### 5.3 P2 後續整理

1. 多語 copy 與營運術語統一
2. 乘客 / 地址主檔品質治理
3. 價格覆寫與複雜商業規則治理
4. 更完整的 map-first dispatch UX
5. 多平台合作與外部 adapter 的深度產品化

## 6. 對既有 SA 的修正建議

`phase1_system_analysis_v1.md` 應在後續 controlled sync 中補強以下章節：

1. 新增「身份與裝置進入流程」
2. 新增「主檔與開通流程」
3. 新增「電話進單與調度操作模型」
4. 新增「合規阻擋與人工 override 規則」
5. 新增「角色責任矩陣」
6. 新增「營運級非功能需求」
7. 新增「tenant onboarding / partner onboarding / driver onboarding」
8. 新增「cross-repo authority 與 contract governance」
9. 新增「observability / alerting / retention / evidence policy」
10. 新增「workflow-based acceptance gate」

在 controlled sync 完成前，本文件作為 Phase 1 SA 的正式補充件。

## 7. 結論

本次盤點結論不是「系統沒有做」，而是：

- 核心 domain 與 API 方向已基本成形
- 主要產品面也都存在
- 但營運級 SA 尚未完全覆蓋真實上線所需的閉環

因此後續工作的正確方向不是重寫整體架構，而是把上述營運級缺口收斂成：

- 明確 SA 條文
- 明確 UI / API / runbook 所有權
- 明確 backlog 優先級
- 明確 cross-repo / auth / rollout / evidence / retention 治理規則

只有把這些補齊，Phase 1 才能從「功能存在」進一步提升到「可穩定營運」。
