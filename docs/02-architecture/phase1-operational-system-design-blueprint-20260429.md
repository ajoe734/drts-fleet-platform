# Phase 1 營運級系統設計藍圖

狀態：system design supplement  
日期：2026-04-29  
適用範圍：`drts-fleet-platform`、`tenant-commute-hub`

## 1. 文件目的

本文件把 `docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`
列出的 29 類營運級缺口，轉成正式系統設計藍圖。

本文件回答的不是「還缺什麼」，而是：

- 應該怎麼設計
- 權威應該落在哪裡
- 角色怎麼互動
- 資料怎麼流
- 什麼應該是 Phase 1 的設計完成線

本文件是 `phase1_system_analysis_v1.md` 的營運級 SD 補充件，與既有
`docs/01-decisions/SD-DP-20260422-001` ~ `003` 不衝突；若遇到拓樸或權威
衝突，仍以 accepted decision packet 為高優先級約束。

## 2. 設計原則

### 2.1 單一業務權威

- `drts-fleet-platform` 是 canonical business authority
- `tenant-commute-hub` 是 tenant / partner frontend consumer
- 所有 booking、dispatch、settlement、audit、eligibility、webhook truth
  均回到 core repo

### 2.2 渠道可差異，交易不可分裂

- tenant、partner、phone、forwarder 可以有不同入口
- 但進單後必須收斂到共同 order / dispatch / audit / settlement truth

### 2.3 先做可營運，再做可優化

- Phase 1 先收斂閉環與責任
- 地圖、批次調度、複雜優化、AV overlay 可以在閉環穩定後疊加

### 2.4 角色與責任顯性化

- 每個流程都必須能回答誰建立、誰審核、誰派遣、誰補件、誰停權、誰結案

### 2.5 合規與證據先於便利

- recording、proof、eligibility、masking、audit、retention 為設計一等公民

## 3. 系統全域設計總圖

### 3.1 Repo 拓樸

- `drts-fleet-platform`
  - API authority
  - platform admin web
  - ops console web
  - driver app
  - contracts / api client / auth / infra / migrations
- `tenant-commute-hub`
  - tenant portal frontend
  - partner booking frontend
  - no backend authority

### 3.2 核心資料流

1. 入口產生需求：tenant / partner / phone / forwarder
2. 需求統一寫入 `owned-mobility` 或 `forwarder`
3. `dispatchOrder` 產生 dispatch job / candidate / assignment / driver task
4. driver app 執行 task lifecycle
5. audit / notification / reporting / settlement 全程跟隨
6. tenant / ops / platform 依角色各自檢視同一份 truth

### 3.3 權威分層

- L1 交易權威：order, booking, dispatch, task, settlement, audit
- L2 主檔權威：tenant, partner, vehicle, driver, contract, policy, webhook
- L3 渠道消費層：tenant portal, partner funnel, driver app, ops console

## 4. 29 類設計藍圖

### 4.1 身份與入口

#### 目標狀態

- 所有 actor 都有明確 realm、auth mode、scopes、lifecycle
- 不同平面不共享錯誤的身份假設

#### 設計

- `platform_admin` / `ops_user`：走 internal control-plane auth
- `tenant_*`：走 backend-issued tenant bootstrap session / JWT bearer
- `partner_api_key`：走 partner ingress auth contract，再換 internal bearer context
- `driver_user`：走 device-bound mobile identity，不走 env-var only

#### 實作原則

- API 僅接受 server-recognized identity context
- UI 不自行決定最終權限
- 所有入口必須可追溯到 actorId / requestId

### 4.2 司機主檔與裝置綁定

#### 目標狀態

- driver identity、driver profile、dispatch eligibility、device binding 可形成單一營運 lifecycle

#### 設計

- `driver master`：平台管理主檔，含 driver 狀態、可派資格、所屬 tenant / fleet、證件狀態
- `driver profile`：司機個人可維護資料
- `driver device binding`：一台或多台裝置與 driver actor 綁定的授權關係

#### 主要狀態

- `draft`
- `active`
- `suspended`
- `retired`

#### 主要流程

1. 平台建立 driver master
2. 綁定可用車型 / service bucket / 證件狀態
3. 發放 device registration token
4. 裝置首次註冊並換取短期 access token
5. token refresh 與 revocation 由 backend 控制

### 4.3 合作方 / 銀行方案開通

#### 目標狀態

- 新銀行或合作方案可以用標準流程開通，而不是靠 seed 修改

#### 設計

- `partner`：合作組織主體
- `partner program`：商業方案，例如信用卡機場接送
- `partner entry`：實際入口 slug / host / branding / auth / eligibility

#### 權威位置

- canonical source 在 `tenant-partner`
- `tenant-commute-hub` 僅消費 partner entry context

#### 流程

1. 建立 partner
2. 建立 partner program
3. 建立 partner entry
4. 配置 auth mode / eligibility mode / support copy / theme accent
5. 發 API key / sandbox credential
6. 驗證後 promotion 到 production

#### 平台後台實作落點

- `platform-admin-web /partners` 提供 partner entry onboarding console
- console 表單必須覆蓋 `partnerCode`、`programId`、`entrySlug`、`authMode`、`eligibilityMode`、branding、support metadata
- canonical persistence 與 audit event 仍由 `tenant-partner` 寫入，不允許再靠 seed 手改開通新方案
- activation / deactivation 要視為 promotion gate 的前置 lifecycle，而不是資料刪除

### 4.4 第三方 API / forwarder 接入

#### 目標狀態

- tenant integration 與 external ride platform integration 有分流但不混亂

#### 設計

- `tenant integration`
  - tenant API keys
  - tenant webhooks
  - `/api/tenant/*`
- `forwarder integration`
  - adapter per platform
  - broadcast / accept / sync-status / sync-failed / manual-fallback / reconciliation-complete
  - source-aware task mirror

#### 原則

- inbound order contract 要區分 `owned` vs `forwarded`
- forwarded order 不進 owned dispatch decision authority
- reconciliation 要依渠道區分

#### Forwarded order lifecycle

1. external platform 透過 adapter / webhook 建立 forwarded mirror order
2. dispatch 只能 broadcast 給合格 driver，不能改寫外部平台權威狀態
3. driver 接單後，本地 order 進入 `accept_pending`，等待 adapter relay acknowledgement
4. 若平台回報 `confirmed_by_platform` / `lost_race` / `cancelled_by_platform`，以 native status 為最終 authority
5. 若 adapter relay 或 sync 中斷，order 轉 `sync_failed`，同時掛起 manual fallback 與 reconciliation job

#### Operating boundaries

- `forwarded` order 一律標記 `orderDomain=forwarded`
- task mirror 一律標記 `dispatchSemantics=forwarder_broadcast`
- fare / settlement / driver payout authority 維持在 external platform；本地 finance 僅做 `shadow_only` ledger projection
- driver app 必須明示 route、fare、completion 狀態受 source platform 約束，dispatch 只能協調，不可本地 override

#### Failure and reconciliation model

- adapter 不存在或 relay 失敗時，forwarder 需產生 machine-readable sync error record
- retryable failure 將 adapter health 標成 `degraded`；non-retryable failure 標成 `down`
- 每次 `sync_failed` 都要建立 reconciliation job，追蹤平台單號、mirror order、失敗原因、mismatch count、完成時間
- manual fallback 由 ops/dispatch 明確啟動，記錄 reason、requestedBy、notes；不得靠口頭流程隱式處理
- native status sync 或人工 reconciliation 完成後，才可清除 sync error 與 manual fallback flag

### 4.5 電話進單與 call center 閉環

#### 目標狀態

- 電話來電、建單、錄音、派遣、callback、客訴轉交形成完整工作台

#### 設計

- `call session`：通話會話權威
- `phone order`：由 call session 派生的 order
- `recording binding`：錄音與 phone order 的合規關聯

#### 流程

1. 進線建立 call session
2. agent announce identity
3. 建單或先 quote ETA
4. 若建立 phone order，綁 callId
5. 錄音 callback 到達後更新 order 合規狀態
6. 必要時轉 complaint 或 callback task

#### UI 設計方向

- call-taker form 與 dispatch queue 要能協同
- screen-pop 與 recording status 要在同一工作流可見

### 4.6 待派清單與 dispatch / redispatch 規則

#### 目標狀態

- 所有可派單何時進 queue、如何升級、如何重派有明確規則

#### 設計

- queue 是 order 的 operational projection，不是獨立 authority
- queue state 由 order status + dispatch job status + compliance state 推導

#### 基本規則

- `ready_for_dispatch`：可直接入隊
- `recording_pending`：不可直接派或需明確 override policy
- `created` reservation：依 confirmation window 轉為 active queue
- `redispatch_required`：進人工優先處理隊列
- `exception_hold`：進異常保留隊列

#### redispatch 設計

- cancel current assignment
- record reason code
- create new dispatch attempt
- retain full trace

### 4.7 地圖與即時位置視角

#### 目標狀態

- 地圖不一定是 Phase 1 P0，但應有明確位置

#### 設計

- Phase 1 P0：表格 + ETA + candidate list
- Phase 1 P1：dispatch map board
- tenant / call center map input：作為地址輸入與 geocode 輔助，不是 authority

#### 原則

- geospatial UI 不能生成第二套調度真相
- driver location truth 仍由 backend / registry / heartbeat 聚合

### 4.8 錄音 / proof / eligibility 合規阻擋

#### 目標狀態

- 合規條件要明確決定是否可派、是否可完單、是否可結算

#### 設計

- `recording gate`
  - 適用於 phone order
- `proof gate`
  - 適用於需要照片、簽收、報銷存證的任務
- `eligibility gate`
  - 適用於 partner benefit / bank program

#### 規則

- 每個 gate 要有：
  - required?
  - blocking?
  - override allowed?
  - override by whom?
  - audit mandatory?

### 4.9 財務 / 對帳 / settlement 閉環

#### 目標狀態

- 每種渠道都能追到誰付款、誰收款、誰開票、誰對帳

#### 設計

- channel-aware finance model
- order financial record 為 canonical basis
- reporting / invoice / statement / reimbursement 由同一交易真相派生

#### 核心欄位

- payer type
- tenantId / partnerId / external platform
- driver earning
- platform fee
- subsidy / reimbursement
- invoice reference
- external receipt reference

### 4.10 tenant onboarding 與 rollout gate

#### 目標狀態

- 新 tenant 上線是標準流程，不是人工記憶

#### 設計

- onboarding package
- default roles
- billing profile bootstrap
- notification defaults
- webhook / api key optional package

#### rollout 階段

- `sandbox`
- `pilot`
- `production`

### 4.11 供給池 lifecycle

#### 目標狀態

- vehicles / drivers / contracts / policies / exclusivity 有一致的生命週期與失效策略

#### 設計

- supply eligibility projection 由 registry 即時計算
- source records 由主檔模組維護
- expiry / invalidation 事件要能影響 dispatch

#### 關鍵事件

- vehicle insurance expired
- driver licenses invalid
- driver offline
- exclusivity revoked

### 4.12 預約單 vs 即時單規則

#### 目標狀態

- reservation orchestration 與 realtime dispatch 不互相污染

#### 設計

- reservation 有 reservation hold lifecycle
- realtime order 直接進 dispatchable queue
- reservation queue 依時間窗轉 active

#### 必備狀態

- `hold_requested`
- `hold_confirmed`
- `queued_for_dispatch`
- `exception_hold`
- `cancelled`

### 4.13 乘客 / 地址主檔治理

#### 目標狀態

- passenger、address 不只是表單資料，而是可治理主檔

#### 設計

- passenger 可對應 employee / cardholder / VIP / passenger role
- address 要有 normalized text、optional geocode、masking policy
- 敏感地址與常用地址要可標籤化

### 4.14 價格權威與人工覆價

#### 目標狀態

- 前端不生成價格 authority
- 覆價要有稽核與責任

#### 設計

- `quotedFare` 只來自 backend authority
- manual override 需標記 actor、reason、effective range
- fixed price / metered rules 要有 source-of-truth

### 4.15 complaint / incident / escalation

#### 目標狀態

- 客訴、事故、服務恢復流程分得清楚

#### 設計

- `complaint`：乘客/客戶不滿、履約爭議、收費爭議
- `incident`：運行事件、安全事件、行程異常
- escalation matrix 決定由 ops、callcenter、finance、platform 誰處理

### 4.16 tenant API / webhook 治理

#### 目標狀態

- tenant integration 可穩定上線與維運

#### 設計

- scoped API key
- rotation / revoke lifecycle
- webhook retry / disable / test contract
- developer handoff pack

### 4.17 control-plane vs business-plane auth 邊界

#### 目標狀態

- internal web / API 與 external tenant / partner / driver auth 邊界明確

#### 設計

- control-plane：IAP / OIDC / internal trust chain
- business-plane：JWT bearer / partner ingress / mobile token
- 不允許一套 bootstrap 假設橫跨所有平面

### 4.18 雙 repo authority drift 防護

#### 目標狀態

- `tenant-commute-hub` 不再長出第二套 backend authority

#### 設計

- contract snapshot 只作 build portability，不作 truth override
- API drift 要有 compatibility / deprecation policy
- cross-repo 破壞性變更必須伴隨 migration note

### 4.19 測試 / acceptance / E2E

#### 目標狀態

- 依 workflow 而不是依單一 repo 驗證

#### 設計

- workflow families:
  - tenant booking
  - partner booking
  - phone order
  - dispatch + driver completion
  - webhook
  - billing/reporting
- 每條 workflow 要有 release gate

### 4.20 observability / alerts

#### 目標狀態

- 關鍵營運異常能被主動發現

#### 設計

- business metrics
- technical metrics
- auditable alerts

#### 最低告警集

- dispatch lag
- webhook failure burst
- driver offline spike
- recording pending backlog
- eligibility verification failure burst

### 4.21 NFR / 容量 / retention

#### 目標狀態

- 主要流程有明確 SLA、容量、保留假設

#### 設計

- latency target by workflow
- throughput assumption by channel
- retention by data family
- degraded mode policy

### 4.22 資安 / sensitive data / masking / secret policy

#### 目標狀態

- 所有敏感資料有一致治理

#### 設計

- data classification matrix
- mask-in-UI, mask-in-export, signed-download, audit-access
- secret types:
  - tenant API key
  - partner API key
  - mobile token
  - webhook secret
  - internal key
- 實作基線見 `phase1-sensitive-data-governance-matrix-20260429.md`
- controlled download 預設 TTL 為 15 分鐘，且 issuing path 必須寫 audit
- partner ingress key / controlled-download signing secret 必須來自環境或 secret manager，不能以 production hardcode 形式存在

### 4.23 留存 / 法規保留 / evidentiary access

#### 目標狀態

- 錄音、audit、proof、eligibility、delivery log 等可依法留存與調閱

#### 設計

- retention schedule by artifact family
- archival vs hot storage
- evidentiary access control
- legal hold / deletion exception
- Phase 1 先落地存取留痕、欄位遮罩與 signed-download gate；完整 retention / legal-hold 排程由 `OPX-CM-005` 收尾

### 4.24 國際化與多語營運

#### 目標狀態

- 各角色面向有一致語言政策

#### 設計

- partner flow：Traditional Chinese first
- operator surfaces：可接受 code / enum，但 user-facing copy 要一致
- glossary 集中治理，避免同義異詞

### 4.25 文件 / 決策 / backlog 同步規則

#### 目標狀態

- SA、SD、decision、code、backlog 同步，不再各說各話

#### 設計

- decision accepted -> backlog created -> evidence expected
- SD supplement changes must reference owning backlog family
- code-backed audit 定期回寫文件

### 4.26 資料模型與 event 邊界

#### 目標狀態

- append-only trace 類資料與 mutable 主檔資料分離

#### 設計

- mutable master records: driver, vehicle, tenant, partner, webhook endpoint
- append-only records: audit, dispatch trace, attempts, deliveries, eligibility history
- 任何 override 都必須留下 event trace

### 4.27 渠道標記與 source-aware lifecycle

#### 目標狀態

- 每筆單都能清楚說明來自哪個渠道、遵守哪種履約規則

#### 設計

- canonical fields:
  - orderSource
  - orderDomain
  - sourcePlatform
  - tenantId
  - partnerId
  - partnerProgramId
  - partnerEntrySlug
- UI / reporting / finance / driver task 都應 source-aware

### 4.28 人工操作與自動化邊界

#### 目標狀態

- 系統明確定義哪些流程可自動、哪些一定要人工確認

#### 設計

- auto:
  - candidate generation
  - webhook retry
  - token refresh
  - report generation
- human-in-the-loop:
  - dispatch override
  - compliance exception release
  - financial dispute resolution
  - sensitive partner onboarding approval

### 4.29 未來擴充掛點

#### 目標狀態

- Phase 1 可被 Phase 2 疊加，而不必重做交易底座

#### 設計

- AV / ODD / ROC live-board 只能掛在已穩定的 owned-mobility, dispatch, incident, reporting hooks 上
- future passenger surface 若重開，也只能作 channel layer，不得破壞 core settlement/audit/disptach truth

## 5. 實作優先順序

### 5.1 P0 設計完成線

- 身份與入口矩陣
- 司機主檔與 device-binding
- partner / bank onboarding
- phone order closed loop
- queue / dispatch / redispatch rules
- compliance gate matrix
- tenant onboarding / rollout gate
- control-plane vs business-plane auth matrix
- cross-repo drift guardrail
- end-to-end workflow acceptance
- data classification / masking / secret policy
- issuer integration design
- reservation orchestration model
- decision-to-backlog sync rule

### 5.2 P1 設計完成線

- 地圖與即時位置視角
- third-party / forwarder deep operating model
- finance reconciliation matrix
- observability / alerts
- NFR / retention / archival
- complaint / incident taxonomy
- tenant integration developer package

### 5.3 P2 / 後續優化

- multilingual operating consistency
- richer map-first dispatch UX
- deeper pricing governance
- expanded passenger/address governance

## 6. SD 與 SA 的關係

- SA 回答：系統要解什麼問題、有哪些角色、有哪些流程
- 本 SD 回答：這些流程的權威、資料流、狀態、操作責任應如何設計

若後續要把本文件內容回寫到 canonical L1 文件，建議分批同步：

1. 身份與裝置
2. 主檔與 onboarding
3. dispatch / queue / compliance
4. integration / finance / retention
5. observability / NFR / governance

## 7. 結論

Phase 1 的問題已經不是「要不要做這些模組」，而是「如何把既有模組收斂成可穩定營運的系統設計」。

本文件的核心立場是：

- 不重做 bounded context
- 不讓 UI repo 再長出第二套 authority
- 不讓營運閉環繼續藏在 service 細節與 runbook 角落
- 以 workflow、權威、責任、證據四條線收斂整個 Phase 1

後續所有 P0 / P1 執行切片，都應明確標註自己對應本文件哪一節。
