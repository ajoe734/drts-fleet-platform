# Platform Admin、Ops Console、Tenant Console Product Specification

**Date:** 2026-05-08
**Archived under:** `docs/01-product`
**Primary apps:** `apps/platform-admin-web`, `apps/ops-console-web`, `apps/tenant-console-web` (planned formal target), `apps/tenant-portal-web` (sunset reference only)
**Primary backend modules:** `platform-admin`, `tenant-partner`, `regulatory-registry`, `owned-mobility`, `forwarder`, `callcenter`, `complaint`, `incident`, `billing-settlement`, `reporting-filing`, `audit-notification`, `operational-observability`
**Status:** Detailed functional and workflow specification for Claude Design and implementation planning

## 1. Executive Summary

本文件定義三套核心管理系統的產品規格與端到端流程：

1. `Platform Admin`
2. `Ops Console`
3. `Tenant Console`

本文件的目的不是提出視覺設計，而是明確定義：

- 每套系統服務誰
- 每套系統應該有哪些功能模組
- 每個模組承擔哪些責任
- 關鍵流程如何跨系統流轉
- 哪些業務邊界不能被 UI 或前端實作打亂
- Tenant Console 在本 repo 內若要正式產品化，應採用什麼範圍與方向

本文件可直接作為：

- Claude Design 的功能設計輸入
- 後續前端重構與新頁面開發藍圖
- 後端 API 對齊與權限邊界校對文件
- 後續 backlog 切片的基礎規格

## 2. Current Baseline And Target Positioning

### 2.1 Current baseline

- `Platform Admin Web` 已是實作中的平台治理後台。
- `Ops Console Web` 已是實作中的營運工作台。
- `Driver App` 已是實作中的司機端。
- `apps/tenant-portal-web` 在 repo 事實上是已 sunset 的參考殼，不是 canonical production tenant UI。
- 歷史上 production tenant UI 指向外部 `tenant-commute-hub` repo，後端 authority 仍是本 repo 的 `/api/tenant/*`。

### 2.2 Target positioning in this spec

本文件對 `Tenant Console` 採取以下定位：

- `現況 production 層`
  目前 live production tenant UI 仍是外部 `tenant-commute-hub` repo。
- `本 repo authority 層`
  `drts-fleet-platform` 持續作為 `/api/tenant/*` 的唯一 backend authority。
- `本 repo 產品化 landing zone`
  自 `2026-05-08` 的 `TEN-UI-001` topology decision 起，若本 repo 要正式承載
  tenant console 開發與交付，正式 target 是規劃中的 `apps/tenant-console-web`，
  而不是重新啟用 `apps/tenant-portal-web`。

因此，本文件定義的 tenant console 功能範圍，應落到新的正式 target，而不是延續舊
reference shell 的 demo 型態。

### 2.3 Explicit non-goals for this document

本文件不處理：

- 視覺風格、色彩、字體、版式探索
- Passenger App / Passenger Web
- 乘客 receipt UI
- Call Point / Concierge Portal
- AV / ODD / live-board 未來範圍
- 外部真實銀行、發卡機構、第三方平台的商務接線細節

這些相鄰 surface 仍然需要 machine-truth 可見性。自 `SYS-UI-001` 起，它們的 landing zone
與 execution mapping 由
`docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
與 `docs/02-architecture/roadmap/fbp-015-deferred-scope-packet.md` 管理；本文件只定義
`Platform Admin`、`Ops Console`、`Tenant Console` 三套管理系統自身的功能邊界。

## 3. Product Principles And Hard Rules

這三套系統都必須遵守相同的產品原則。

### 3.1 Backend is the authority

- 狀態機、計價、派車資格、審核結果、帳務結果、報表結果、審計紀錄都以後端為唯一真值。
- 前端不得直接修改 entity 的狀態欄位來表達命令語意。
- 前端只能呼叫 command endpoint 來要求狀態轉換。

### 3.2 Owned and forwarded are different domains

- `owned` 訂單由 DRTS 主導派遣與執行。
- `forwarded` 訂單由外部平台或 mirror 流程主導，DRTS 只能處理其本地 mirror、補救、稽核與對帳。
- UI 不得把 forwarded 訂單假裝成 owned 訂單來操作。

### 3.3 Audit is append-only

- audit log 是觀察面，不是控制面。
- audit 只能讀，不能被前端竄改、刪除或拿來當作狀態控制源。

### 3.4 Billing and settlement are backend-owned

- invoice、statement、settlement matrix、reconciliation issue 的業務計算在後端。
- 前端只能顯示結果、送出審批與處理命令、維護 evidence 與評論。

### 3.5 Tenant and partner are not platform-admin by proxy

- 租戶可管理自己租戶範圍內的設定與資料。
- 租戶不能越權做平台級別治理。
- Partner booking mode 不能暴露完整 tenant admin 能力。

### 3.6 Traditional Chinese readiness

- 所有 user-facing 管理功能都應 Traditional Chinese ready。
- 系統可保留 route、ID、enum、API key scope、artifact code 等技術字串，但主要操作文案應可中文化。

## 4. System Landscape

| System           | Primary users                                                 | Core responsibility                                                                        | Upstream                                                            | Downstream                                             |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------ |
| `Platform Admin` | 平台超管、平台營運治理、平台法遵、平台財務治理                | 治理平台配置、租戶開通、夥伴入口、價格、車隊主檔、法定資訊、平台公告、平台級健康           | backend authority modules                                           | Tenant Console、Ops Console、Driver App、partner flows |
| `Ops Console`    | 派車員、客服、客訴專員、安全主管、營運主管、營運財務 reviewer | 即時處理 dispatch、callcenter、complaints、incidents、maintenance、reports、revenue review | Tenant bookings、call sessions、forwarder intake、platform policies | Driver App、finance review、audit trail                |
| `Tenant Console` | 租戶管理員、租戶營運、租戶整合管理、租戶財務                  | 建立與追蹤 booking、維護乘客與地址、管理使用者、webhook、API key、通知、SLA、帳務、報表    | tenant auth session、tenant profile、platform tenant capability     | Ops Console、billing/reporting、partner integrations   |

## 5. Shared Core Domain Objects

三套系統會看到不同視角的同一批核心物件。

| Object                                | Meaning                                                      | Main producer                                    | Main consumer surfaces                                  |
| ------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------- |
| `Platform tenant`                     | 平台上的租戶主檔、配額、rollout、integration package         | `platform-admin`                                 | Platform Admin                                          |
| `Partner entry`                       | 銀行/合作夥伴入口定義、auth mode、eligibility mode、branding | `tenant-partner`, `platform-admin`               | Platform Admin, Tenant Console partner mode, Ops review |
| `Booking / order`                     | 乘車申請與訂單生命週期                                       | `tenant-partner`, `owned-mobility`, `callcenter` | Tenant Console, Ops Console, Driver App                 |
| `Dispatch job`                        | 派車任務與候選派發關係                                       | `owned-mobility`                                 | Ops Console                                             |
| `Forwarded order`                     | 外部平台 mirror 訂單                                         | `forwarder`                                      | Ops Console, Driver App                                 |
| `Driver task`                         | 司機端可執行任務                                             | `owned-mobility`, `forwarder`                    | Driver App, Ops Console                                 |
| `Complaint case`                      | 客訴案件與 SLA / closeout 流程                               | `complaint`                                      | Ops Console                                             |
| `Incident`                            | 事故、安全事件、服務補救流程                                 | `incident`                                       | Ops Console, Driver App                                 |
| `Invoice / statement / reimbursement` | 財務與結算讀模型與命令物件                                   | `billing-settlement`                             | Platform Admin, Tenant Console, Ops Console             |
| `Report job / filing package`         | 報表產物與 filing 封裝                                       | `reporting-filing`                               | Ops Console, Tenant Console                             |
| `Webhook endpoint / delivery`         | 租戶或 partner 對外整合設定與投遞紀錄                        | `tenant-partner`                                 | Tenant Console, Platform Admin                          |
| `Audit log`                           | append-only 操作紀錄                                         | `audit-notification`                             | Platform Admin, Tenant Console                          |
| `Operational observability snapshot`  | 平台健康與告警彙整                                           | `operational-observability`                      | Platform Admin, Ops Console                             |

## 6. Cross-System Macro Flows

本章定義最重要的跨系統主流程。

### 6.1 Tenant onboarding and rollout

1. 平台管理員在 `Platform Admin > Tenants` 建立 tenant。
2. 設定 enabled modules、integration mode、sandbox / production base URL、billing baseline、default webhook events。
3. 邀請並確認 tenant 角色。
4. 將 tenant 推進 `sandbox -> pilot -> production`。
5. Tenant Console 在相應 rollout stage 開啟能力。
6. 若發生重大問題，Platform Admin 進入 `rollback_hold` 並阻止後續 promotion。

### 6.2 Tenant booking to dispatch to trip to settlement

1. 租戶在 `Tenant Console` 建立 booking。
2. booking 進入 backend 後形成 owned order。
3. `Ops Console > Dispatch` 接手分派與異常處理。
4. `Driver App` 接單、執行 trip、補 proof、完單。
5. 完單結果流入 revenue、driver statements、tenant invoice、reports、audit。
6. 若產生客訴或事故，轉入 complaints / incidents。

### 6.3 Phone order to complaint or incident

1. 客服在 `Ops Console > Callcenter` 開啟 call session。
2. 可建立電話訂單、連結既有訂單、附掛錄音、建立 callback task。
3. 若來電內容為申訴，直接轉 complaint case。
4. 若為安全或營運事故，升級為 incident。
5. complaint / incident 的後續 timeline 與 recovery action 留存在相應工作台。

### 6.4 Partner booking and eligibility

1. 平台管理員在 `Platform Admin > Partners` 設定 partner entry。
2. partner caller 經 auth / bootstrap 進入 partner booking mode。
3. 若該 program 需要 eligibility，先進行資格驗證。
4. 驗證成功後才能建立 booking。
5. 後續訂單、audit、billing、reporting、finance review 都必須能追溯 partner id、program id、entry slug、eligibility verification id。

### 6.5 Forwarded platform exception to reconciliation

1. 外部平台 mirror 訂單進入 `Ops Console > Dispatch (forwarded)`。
2. 若 sync failed、manual fallback required 或 status mismatch，建立 reconciliation issue。
3. reviewer 進行 assign、comment、evidence、resolve、reopen。
4. 結果回寫到 revenue / finance review 與 audit。

### 6.6 Platform policy publication

1. `Platform Admin` 建立或修改 pricing rule、driver fee plan、public info version、placard、feature flags。
2. 經 publish 流程後，對 Tenant Console、Ops Console、Driver App 產生下游影響。
3. 任何 policy 變更都必須保留版本與審計足跡。

## 7. Platform Admin

### 7.1 Product goal

`Platform Admin` 的產品目標是讓平台治理人員能安全地管理：

- 平台租戶
- 平台合作夥伴與 entry
- 車隊主檔與法遵
- 價格、結算、法定資訊與公告
- 平台級審計、告警與 feature switch

它不是日常派車台，也不是租戶操作台。

### 7.2 Primary personas

| Persona                 | Primary concerns                                                            |
| ----------------------- | --------------------------------------------------------------------------- |
| 平台超管                | 全域權限、帳號、feature switch、敏感操作                                    |
| 租戶開通經理            | tenant 開通、rollout gate、integration package                              |
| 合作夥伴治理經理        | partner entry、credential、eligibility mode、branding                       |
| 法遵 / 車隊治理人員     | 車輛、司機、保險、exclusivity、offboarding                                  |
| 平台財務治理人員        | pricing rule、fee plan、invoice / statement / reimbursement、reconciliation |
| 平台維運 / 風險治理人員 | notice、maintenance mode、health、audit、evidence governance                |

### 7.3 Current route map

| Route               | Module                           | Responsibility                                                |
| ------------------- | -------------------------------- | ------------------------------------------------------------- |
| `/`                 | Home                             | 平台工作入口與模組導覽                                        |
| `/tenants`          | Tenant Governance                | tenant 主檔、模組、quota、onboarding、rollout                 |
| `/partners`         | Partner Entry Governance         | partner entry、branding、auth、eligibility、credential        |
| `/users`            | Platform User Governance         | 平台人員帳號與角色                                            |
| `/fleet`            | Fleet & Compliance Governance    | vehicles、drivers、contracts、device binding、dispatchability |
| `/switchboard`      | Public Info & Placard Governance | public info versioning、placard generation / publish          |
| `/pricing`          | Pricing Governance               | pricing rules、fee plans、publish windows                     |
| `/payments`         | Settlement Governance            | invoices、statements、reimbursements、reconciliation issues   |
| `/health`           | Platform Health                  | alerts、observability、adapter health                         |
| `/notices`          | Notices & Maintenance            | platform notices、maintenance mode                            |
| `/audit`            | Audit & Evidence Governance      | audit log、retention policy、legal hold、deletion exception   |
| `/feature-flags`    | Feature Flags                    | global / tenant override switch governance                    |
| `/adapter-registry` | Adapter Governance               | 平台 adapter registry                                         |

### 7.4 Module specifications

#### 7.4.1 Home

功能責任：

- 提供平台控制平面的總入口。
- 顯示所有治理模組的責任說明。
- 作為受保護管理面的 landing page。

必備能力：

- 模組卡片導覽
- 快速跳轉
- 多語切換
- 環境標識

#### 7.4.2 Tenant Governance

目標：

- 管理 tenant 從建立到 production rollout 的完整生命週期。

必備資料：

- tenant name / code / status
- enabled modules
- quotas
- integration mode
- bootstrap admin email
- billing baseline
- webhook baseline
- sandbox / production URL
- rollout stage
- gate status
- cutover owner / rollback owner
- required role invitations / acknowledgements

必備動作：

- create tenant
- update settings
- update onboarding package
- invite tenant role
- acknowledge tenant role
- set rollout stage
- activate
- suspend
- enter rollback hold

不可缺漏的流程狀態：

- `sandbox`
- `pilot`
- `production`
- `rollback_hold`
- gate `pending / ready / approved / blocked`

#### 7.4.3 Partner Entry Governance

目標：

- 管理對外 partner / bank program 的進站入口。

必備資料：

- tenantId
- partner code / type
- program id / code
- bank code
- entry slug
- display name
- business dispatch subtype
- auth mode
- eligibility mode
- entry host / path
- theme accent
- support contact
- status
- readiness indicators
- ingress credentials

必備動作：

- create entry
- edit entry
- activate / deactivate / revoke
- issue credential
- revoke credential
- 查看 readiness 缺口

不可缺漏的風險控制：

- inactive entry 不可繼續對外服務
- 不同 partner / tenant scope 不可混用
- eligibility mode 必須被明確綁定

#### 7.4.4 Platform Users

目標：

- 管理平台內部使用者與角色。

必備資料：

- user id
- display name
- email
- role code
- status
- updated time

必備動作：

- create staff user
- update role
- 顯示狀態

#### 7.4.5 Fleet & Compliance Governance

目標：

- 管理車輛、司機、合約與法遵生命週期。

子域：

- vehicles
- drivers
- contracts
- driver-device binding
- exclusivity review
- vehicle offboarding / debranding

必備資料：

- driver lifecycle
- licenses valid
- supported service buckets
- vehicle dispatchable flag
- contract status
- exclusivity declaration
- debranding requirement and due date
- device binding summary

必備動作：

- create driver
- update driver lifecycle
- revoke device binding
- update vehicle compliance
- submit exclusivity review
- approve / reject exclusivity
- initiate offboarding
- complete debranding

#### 7.4.6 Public Info & Placard Governance

目標：

- 管理法定展示資訊、公開聯絡與 placard 版本。

必備資料：

- public info draft / published / retired versions
- effectiveFrom / effectiveTo
- call phone
- complaint phone
- fare text
- payment method text
- placard version code
- placard source version
- placard artifact file / publish state

必備動作：

- create public info version
- publish version
- delete draft
- generate placard version
- publish placard

#### 7.4.7 Pricing Governance

目標：

- 管理平台 pricing rule 草稿與正式發布。

必備資料：

- rule name / version
- service fee bps
- reimbursement mode
- applicable scope
- notes
- effective from / to
- driver fee plan versions
- product rule catalog authority hints

必備動作：

- create draft pricing rule
- publish pricing rule
- publish driver fee plan

不可缺漏的資訊：

- canonical quoted fare authority
- manual override actor types
- required fields for override governance

#### 7.4.8 Settlement Governance

目標：

- 治理平台層財務與結算問題，而不是單純查看報表。

必備子域：

- tenant invoices
- driver statements
- reimbursement batches
- settlement matrix
- reconciliation issues

必備動作：

- generate tenant invoices
- generate driver statements
- approve reimbursement batch
- mark reimbursement paid
- create reconciliation issue
- assign issue
- comment with artifact ids
- resolve issue
- reopen issue

需要保留的關聯資訊：

- tenant id
- partner id
- partner program id
- sponsor reference
- mirror order id
- external order id
- linked reconciliation job id

#### 7.4.9 Platform Health

目標：

- 給平台治理者看平台整體健康，不等同於營運派單 dashboard。

必備資料：

- alert list
- dispatch lag metrics
- webhook queue metrics
- eligibility review queue
- reporting failures
- adapter counts
- adapter health status

必備動作：

- refresh
- 在 alerts / adapters 間切換
- 按 route 觀看 platform relevant alerts

#### 7.4.10 Notices & Maintenance

目標：

- 管理平台公告與全域 maintenance mode。

必備資料：

- notice title / body / severity / audience / status
- maintenance enabled
- maintenance reason
- updated time

必備動作：

- create notice
- resolve notice
- set maintenance mode

#### 7.4.11 Audit & Evidence Governance

目標：

- 提供高敏感操作的可追溯性與證據治理視圖。

必備資料：

- audit records
- evidence retention policies
- active legal holds
- active deletion exceptions
- actor type
- module name
- request id

必備動作：

- filter by module / actor type
- 展開明細
- refresh

#### 7.4.12 Feature Flags & Adapter Registry

目標：

- 管理平台能力開關與 adapter inventory。

必備資料：

- flag key / enabled / tenant override / updatedAt
- adapter list / status / config metadata

必備動作：

- toggle feature flag
- 檢視 adapter
- 編輯 adapter

### 7.5 Platform Admin key workflows

#### 7.5.1 New tenant provisioning workflow

1. 建立 tenant 基本資料。
2. 選擇 enabled modules 與 integration mode。
3. 填入 bootstrap admin 與 baseline。
4. 寫入 sandbox URL、billing、webhook 預設。
5. 邀請 tenant 角色並逐一 acknowledge。
6. 推進 sandbox gate。
7. 進 pilot。
8. 命名 cutover owner / rollback owner。
9. rollbackPrepared 為真後，允許 production promotion。
10. 若出現重大事故，進 rollback hold。

#### 7.5.2 Partner entry setup workflow

1. 建立 partner entry。
2. 設定 partner / bank / program / subtype。
3. 綁定 auth mode 與 eligibility mode。
4. 寫 branding 與 support metadata。
5. 檢查 readiness。
6. issue ingress credential。
7. 驗證 entry 可進入 booking funnel。
8. activate。
9. 如有合規或商務問題可 deactivate 或 revoke。

#### 7.5.3 Driver and vehicle governance workflow

1. 建立或同步 driver master。
2. 檢查 license / supported service buckets。
3. 檢查 device binding。
4. 檢查 vehicle registry 與 dispatchable flag。
5. 如有 exclusivity，送審核。
6. 若退場，走 offboarding / debranding。

#### 7.5.4 Public info and placard publication workflow

1. 建立 public info draft。
2. 檢查文案與時效區間。
3. publish version。
4. 選擇合法 source version。
5. 產生 placard artifact。
6. publish placard。
7. 保留歷史版本與 retired audit note。

#### 7.5.5 Pricing and settlement publication workflow

1. 建立 pricing draft。
2. 審核費率與 reimbursement mode。
3. publish pricing rule。
4. 發佈 driver fee plan。
5. 下游 finance / ops 依此出 statement、invoice、matrix。

#### 7.5.6 Reconciliation governance workflow

1. 建立 reconciliation issue。
2. 指定 owner。
3. 補 comment 與 artifact ids。
4. 確認 resolution code 與 summary。
5. resolve。
6. 若新證據推翻結論，reopen。

### 7.6 Platform Admin non-goals

- 不做即時 call center 操作。
- 不做一線派車操作。
- 不直接操作司機 trip lifecycle。
- 不提供乘客端體驗。

## 8. Ops Console

### 8.1 Product goal

`Ops Console` 的產品目標是讓一線營運人員能在同一套工作台裡完成：

- 訂單派遣與例外處理
- 電話客服與電話建單
- 客訴與事故處理
- 報表與 filing 操作
- 營運收益與 reconciliation review
- 班次、車輛、保修與供給狀態巡檢

這是一套即時工作系統，不是純查詢報表。

### 8.2 Primary personas

| Persona                      | Primary concerns                                           |
| ---------------------------- | ---------------------------------------------------------- |
| 派車員                       | queue、ETA、candidate、redispatch、例外單                  |
| 客服人員                     | call session、電話建單、callback、錄音、客訴轉案           |
| 客訴專員                     | assign、timeline、resolution、SLA breach、reopen           |
| 安全主管 / incident reviewer | safety、critical queue、service recovery                   |
| 營運財務 reviewer            | revenue、settlement matrix、forwarder mismatch             |
| 出勤 / 車隊主管              | shift、attendance、driver availability、maintenance impact |

### 8.3 Current route map

| Route                 | Module                   | Responsibility                                        |
| --------------------- | ------------------------ | ----------------------------------------------------- |
| `/dashboard`          | Operations Dashboard     | 日常營運總覽                                          |
| `/dispatch`           | Dispatch                 | 自營與 forwarded 派車工作流                           |
| `/callcenter`         | Call Center              | 來電工作台、建單、回撥、錄音                          |
| `/complaints`         | Complaint Center         | 客訴案件全流程                                        |
| `/incidents`          | Incident Center          | 事故、安全事件、service recovery                      |
| `/reports`            | Reporting                | report jobs、filing packages、artifact                |
| `/revenue`            | Revenue Review           | 收益、channel mix、settlement matrix、mismatch review |
| `/attendance`         | Attendance               | 班次與出勤監控                                        |
| `/maintenance`        | Maintenance              | 維修保養工單                                          |
| `/drivers`            | Drivers                  | 司機總表與 drill-down                                 |
| `/drivers/[driverId]` | Driver Detail / Earnings | 特定司機收益與狀態                                    |
| `/vehicles`           | Vehicles                 | 車輛檢視                                              |
| `/contracts`          | Contracts                | 合約與 partner relation 檢視                          |
| `/feature-flags`      | Feature Flags            | 營運層可見能力開關檢視                                |

### 8.4 Module specifications

#### 8.4.1 Operations Dashboard

目標：

- 用一頁看當下最重要的營運風險與工作量。

必備內容：

- health payload
- identity summary
- active orders
- dispatch queue depth
- driver availability
- stale location count
- incidents
- maintenance
- report jobs
- revenue snapshot
- observability alerts by ops route

必備用途：

- 早班巡檢
- 異常尖峰判斷
- 轉派到子模組

#### 8.4.2 Dispatch

此模組必須明確拆成兩個視角：

- `owned dispatch view`
- `forwarded dispatch view`

##### Owned dispatch

必備資料：

- owned orders
- dispatch jobs
- queue state
- compliance gates
- candidates
- ETA
- override request
- exception hold
- no supply resolution state

必備動作：

- assign
- release
- cancel
- fare override
- redispatch
- request override
- approve / reject override
- resolve no supply

##### Forwarded dispatch

必備資料：

- forwarded order status
- source platform
- adapter health
- reconciliation job
- sync failure
- manual fallback required
- race outcome

必備動作：

- sync status
- mark error
- trigger fallback
- reconcile
- 快速跳轉 revenue / contracts

#### 8.4.3 Call Center Workspace

目標：

- 將電話來電、建單、錄音、回撥與客訴轉接整合在一個工作台。

必備資料：

- call sessions
- call type
- caller phone
- linked order
- callback tasks
- recording state
- dispatch trace

必備動作：

- open call session
- announce agent identity
- close session
- attach recording callback
- quote ETA
- create callback task
- complete callback task
- create phone booking
- link existing order
- transfer to complaint

#### 8.4.4 Complaint Center

目標：

- 處理租戶、電話或營運端升級的客訴案件。

必備資料：

- case source
- category
- severity
- description
- related order
- related call
- assignee
- SLA breach flag
- reopen count
- export view
- timeline

必備動作：

- create complaint
- assign case
- add note
- mark SLA breach
- resolve
- close
- reopen
- escalate to incident

#### 8.4.5 Incident Center

目標：

- 處理安全、營運、司機、乘客相關事故與補救措施。

必備資料：

- incident id
- title
- category
- severity
- status
- related order / vehicle / driver / complaint
- reportedBy
- occurredAt
- location
- timeline
- recovery actions

必備動作：

- create incident
- update incident
- resolve
- close
- add service recovery action

必備特化場景：

- driver SOS critical incident intake
- complaint escalation
- safety officer routing

#### 8.4.6 Reporting

目標：

- 讓營運能自己發起與取回報表，不依賴工程手動撈資料。

必備資料：

- report jobs
- report job detail
- filing packages
- package detail
- artifact metadata
- expiresAt

必備動作：

- create report job
- generate filing package
- 查看 detail
- 下載 signed artifacts

#### 8.4.7 Revenue Review

目標：

- 給營運與 reviewer 看收入、派遣來源與異常對帳。

必備資料：

- revenue insights by period / service bucket / vehicle
- platform / partner / phone / tenant channel mix
- forwarded sync failed count
- settlement matrix
- reconciliation issues

必備動作：

- filter by period
- filter by service bucket
- filter by vehicle
- 查看 mismatch 與 linked finance issue

#### 8.4.8 Attendance

目標：

- 看班次與出勤，不需要進司機 app 才知道供給狀態。

必備資料：

- shifts
- attendance records
- active shift count
- completed shift count
- attendance anomalies

#### 8.4.9 Maintenance

目標：

- 管理車輛維護工單，讓派車能理解供給限制。

必備資料：

- maintenance type
- status
- vehicle id
- scheduled / completed time
- technician
- cost
- overdue state

必備動作：

- create record
- edit record
- filter by status
- search

#### 8.4.10 Drivers / Vehicles / Contracts

目標：

- 給營運一個快速查詢主資料與決策上下文的地方。

必備內容：

- driver list
- driver detail / earnings
- vehicle registry
- contract registry
- partner eligibility review queue

### 8.5 Ops Console key workflows

#### 8.5.1 Owned dispatch workflow

1. order 進入 queue。
2. dispatcher 查看 queue state、service bucket、ETA。
3. 讀取 candidates 與 compliance gates。
4. assign。
5. 若 driver 未接、無供給或發生例外，做 redispatch / no-supply / override。
6. 任務流向 driver app。
7. 若 trip 完成，結果回流 revenue / reports。

#### 8.5.2 Forwarded dispatch workflow

1. forwarded order mirror 進入 board。
2. 進入 `received / broadcasted / accept_pending / confirmed / lost_race / cancelled / sync_failed` 狀態。
3. 若正常，作為 mirror 觀察。
4. 若 sync failed 或 fallback required，ops 介入。
5. 需要時建立或追蹤 reconciliation issue。

#### 8.5.3 Call-center booking workflow

1. 開 call session。
2. 宣告 agent identity。
3. 判斷 caller 需求。
4. 可直接 create phone order。
5. 若已有訂單，link existing order。
6. 視需要 attach recording、quote ETA、create callback。
7. 結束後 close session。

#### 8.5.4 Complaint workflow

1. create complaint。
2. assign reviewer。
3. 寫 note。
4. 若已 breach SLA，標記 breach。
5. resolve。
6. close。
7. 若後續又有爭議，reopen。
8. 若超出客訴處理範圍，escalate to incident。

#### 8.5.5 Incident workflow

1. create incident 或由 complaint / driver SOS 升級。
2. 依 severity 與 category 排優先級。
3. 建立 timeline。
4. 執行 recovery actions。
5. resolve / close。

#### 8.5.6 Revenue and mismatch workflow

1. 檢視 revenue insight。
2. 發現 forwarded mismatch 或 partner sponsor mismatch。
3. 追到 finance reconciliation issue。
4. 根據 linked identifiers 分派 owner。
5. 最終 resolve / reopen。

#### 8.5.7 Fleet impact workflow

1. 查看 attendance 與 maintenance。
2. 判斷 driver / vehicle 是否可用。
3. 回饋 dispatch 決策。

### 8.6 Ops Console non-goals

- 不做平台級 tenant 開通與全域 policy 發布。
- 不直接管理 partner ingress credential。
- 不讓一線營運越權改寫 platform governance 設定。

## 9. Tenant Console

### 9.1 Product goal

`Tenant Console` 的產品目標是讓租戶能在自己的權限範圍內：

- 建立與追蹤 booking
- 維護乘客與地址資料
- 管理租戶使用者、API keys、webhooks、SLA、通知
- 查看帳務與報表
- 查詢租戶稽核

它應是租戶自助與租戶營運入口，不是平台治理後台。

### 9.2 Current baseline and adopted productization topology

#### Current baseline

- 本 repo 內有 `apps/tenant-portal-web` 參考殼。
- 它已有 booking、reports、billing、webhooks、passengers、addresses、users、audit、notifications、SLA、feature flags、API keys 等頁面雛形。
- 但此 app 在 repo 文檔上被標為 sunset reference shell。

#### Adopted topology (2026-05-08)

`TEN-UI-001` 已採納以下產品化路徑：

- live production tenant UI 目前仍是外部 `tenant-commute-hub`
- 本 repo 的正式 tenant-console landing zone 是規劃中的 `apps/tenant-console-web`
- `apps/tenant-portal-web` 保持 sunset reference shell，不重新作為產品 target
- `/api/tenant/*` 持續是唯一 authority
- auth / identity 必須以真正 tenant bearer identity / scopes 為主，不延續 demo
  cookie RBAC
- 保留兩種模式，但必須明確隔離：
  - `Tenant Admin Mode`
  - `Partner Booking Mode`
- partner booking mode 若落在同一 app，必須使用獨立 route group / nav 邊界，不得
  洩漏 tenant-admin 導覽與治理功能
- Passenger 與 assisted-entry (`Call Point` / `Concierge`) surface 不落在本 app；
  它們由 `SYS-UI-001` 另行決定到 `apps/passenger-web` 與 `apps/assisted-entry-web`
  的相鄰 landing zone

### 9.3 Primary personas

| Persona                    | Primary concerns                        |
| -------------------------- | --------------------------------------- |
| Tenant Admin               | 使用者、角色、整合設定、SLA、通知、帳務 |
| Tenant Operator            | booking 建立、查單、乘客與地址資料      |
| Tenant Finance / Analyst   | invoice、reports、audit                 |
| Tenant Integration Manager | API keys、webhooks、delivery visibility |
| Viewer                     | 只讀查詢                                |
| Partner booking user       | 僅 booking funnel，不暴露 tenant admin  |

### 9.4 Operating modes

#### 9.4.1 Tenant Admin Mode

適用於一般租戶登入後的完整工作台。

可見模組：

- home
- bookings
- passengers
- addresses
- users
- notifications
- SLA
- webhooks
- API keys
- billing
- reports
- audit
- feature flags

#### 9.4.2 Partner Booking Mode

適用於 `/partner/:entrySlug` 或未來 host-resolved partner 入口。

可見能力應限制為：

- login / bootstrap
- partner entry context
- eligibility verification
- booking creation
- booking result / minimal tracking

不可暴露：

- API keys
- users
- audit
- billing admin
- webhook admin
- platform / tenant administration navigation

### 9.5 Proposed route and module map

| Route                          | Module                   | Responsibility                                     |
| ------------------------------ | ------------------------ | -------------------------------------------------- |
| `/`                            | Workspace Home           | tenant 狀態、能力、快捷入口                        |
| `/bookings` or `/booking-list` | Booking List             | 查詢 booking、filter、進 detail                    |
| `/bookings/new`                | Booking Create           | 建立新 booking                                     |
| `/bookings/:id`                | Booking Detail           | 狀態、時間窗、乘客、路線、補充欄位、可編輯性       |
| `/passengers`                  | Passenger Directory      | 維護乘客主檔                                       |
| `/addresses`                   | Address Book             | 維護常用地址                                       |
| `/users`                       | Tenant Users             | 邀請與調整租戶使用者                               |
| `/notifications`               | Notification Preferences | 訂閱事件與 channel                                 |
| `/sla`                         | SLA Profile              | SLA threshold 維護                                 |
| `/webhooks`                    | Webhook Management       | endpoint、events、delivery logs                    |
| `/api-keys`                    | API Keys                 | issue、rotate、revoke                              |
| `/billing`                     | Billing & Invoices       | billing profile、invoices、artifact                |
| `/reports`                     | Reports                  | tenant report jobs、artifact                       |
| `/audit`                       | Audit Trail              | 租戶範圍操作稽核                                   |
| `/feature-flags`               | Feature Visibility       | 只讀 feature/module 可見性                         |
| `/integration-governance`      | Recommended new page     | API key、webhook、notification、SLA readiness 總覽 |

### 9.6 Module specifications

#### 9.6.1 Workspace Home

目標：

- 顯示 tenant 身份、目前模組能力、API 連線狀態與快速操作。

必備內容：

- tenant identity context
- module enablement
- integration health summary
- pending bookings / recent updates
- quick links

#### 9.6.2 Booking Management

目標：

- 讓租戶建立、查詢、追蹤與在允許狀態下調整 booking。

必備資料：

- booking id / order id
- service bucket / subtype
- order status
- pickup / dropoff
- reservation window
- passenger
- flight / terminal / luggage / notes / cost center / vehicle preference / onsite contact

必備動作：

- create booking
- list bookings
- view detail
- update booking
- cancel booking

必備規則：

- 狀態變更只能透過 command endpoint。
- 不可讓前端直接改 order status。
- 已進入不可編輯狀態的 booking 應切換為唯讀追蹤。

#### 9.6.3 Passenger Directory

目標：

- 維護常用乘客資料，供 booking 表單快速帶入。

必備資料：

- full name
- employee no
- department
- mobile
- email
- active flag

必備動作：

- create passenger
- edit passenger
- deactivate / delete by allowed command semantics

#### 9.6.4 Address Book

目標：

- 維護常用上下車地址，支援乘客與部門場景。

必備資料：

- address name
- address text
- lat / lng
- tags
- owner passenger
- active flag

必備動作：

- create address
- update address
- export view
- deactivate / delete by allowed command semantics

#### 9.6.5 Tenant Users

目標：

- 管理租戶內部協作人員。

必備資料：

- user id
- display name
- email
- role
- status

必備動作：

- invite user
- update role
- update status

必備規則：

- 只有 tenant admin 可操作
- 角色應以後端 role catalog 為準

#### 9.6.6 Notification Preferences

目標：

- 租戶決定哪些事件送到哪些 channel。

必備資料：

- event type
- channel
- enabled

必備動作：

- update subscriptions

預期 channel：

- email
- webhook
- ops_console

#### 9.6.7 SLA Profile

目標：

- 讓租戶調整自身 SLA threshold。

必備資料：

- wait threshold
- arrival threshold
- completion threshold
- updatedAt

必備動作：

- update SLA profile

#### 9.6.8 Webhook Management

目標：

- 管理租戶對外整合的 webhook endpoint 與可見投遞紀錄。

必備資料：

- webhook url
- event list
- secret metadata
- status
- delivery logs
- related notification visibility

必備動作：

- create endpoint
- update endpoint
- delete endpoint
- view deliveries

說明：

- delivery log 可先是 visibility layer，但最終應對齊真實 delivery engine。

#### 9.6.9 API Key Management

目標：

- 讓租戶安全管理 API 整合憑證。

必備資料：

- key name
- key prefix / masked suffix
- scopes
- last used
- expiresAt
- revokedAt

必備動作：

- issue key
- rotate key
- revoke key

#### 9.6.10 Billing & Invoices

目標：

- 讓租戶查看帳務概況與下載發票產物。

必備資料：

- billing profile
- invoice list
- status
- amount
- billing period
- artifact URL / expiresAt

#### 9.6.11 Reports

目標：

- 讓租戶自行建立報表工作並下載產物。

必備資料：

- job type
- format
- status
- artifact
- expiresAt
- createdAt

必備動作：

- create report job
- refresh job list
- download artifact

#### 9.6.12 Audit Trail

目標：

- 讓租戶查看自己範圍內的重要操作紀錄。

必備資料：

- createdAt
- actorType / actorId
- moduleName
- actionName
- resourceType / resourceId
- requestId

#### 9.6.13 Integration Governance

這是建議新增的產品頁，不是現有 shell 的必備頁。

目標：

- 將 tenant integration readiness 集中在一頁檢視。

應彙整：

- API key readiness
- webhook endpoint readiness
- notification routing readiness
- SLA profile completeness
- report availability
- module enablement

### 9.7 Tenant Console key workflows

#### 9.7.1 Tenant login and workspace bootstrap

1. 使用 tenant bearer / bootstrap session 進入。
2. 讀取 identity context。
3. 讀取 feature flags 與 module enablement。
4. 顯示對應的功能導覽。
5. 若為 partner mode，改用受限導覽。

#### 9.7.2 Booking creation workflow

1. 選擇 booking subtype。
2. 輸入或選擇 pickup / dropoff。
3. 設定 reservation window。
4. 選擇 passenger 或手填乘客。
5. 視場景填寫 flight / terminal / luggage / notes / cost center。
6. submit。
7. 成功後進 detail 或回 list。

#### 9.7.3 Booking tracking and change workflow

1. 進 booking list。
2. 用 status filter 搜尋。
3. 點進 detail。
4. 若仍可調整則 update。
5. 若需取消則走 cancel command。
6. 若已超過可調整階段，轉成唯讀追蹤。

#### 9.7.4 Passenger and address maintenance workflow

1. 建立 passenger。
2. 建立 address。
3. 將 address 與 passenger / tags 關聯。
4. 在 booking 表單快速引用。

#### 9.7.5 Tenant access governance workflow

1. admin 邀請 user。
2. 指派 role。
3. 需要時 suspend。
4. 所有變更進 audit。

#### 9.7.6 API key lifecycle workflow

1. issue key。
2. 設 scope 與 expiry。
3. 整合方上線。
4. 需要時 rotate。
5. 舊 key revoke。

#### 9.7.7 Webhook lifecycle workflow

1. create endpoint。
2. 指定 events。
3. 驗證 URL 與 secret。
4. 上線後觀察 delivery logs。
5. 出現問題時 update 或停用。

#### 9.7.8 Tenant reporting workflow

1. 建立 report job。
2. 等待完成。
3. 下載 artifact。
4. 依權限共享內部使用。

#### 9.7.9 Partner booking workflow

1. partner entry 進站。
2. 顯示 partner / bank branding 與 entry context。
3. 若需要 eligibility，先驗證。
4. 驗證成功後建立 booking。
5. 僅顯示 booking funnel 與必要結果頁。

### 9.8 Tenant Console non-goals

- 不做平台級 tenant 開通。
- 不做全域 feature flag 治理。
- 不做即時 dispatch 決策。
- 不直接改寫 order / invoice / audit 真值。
- 不暴露 partner ingress credential 或平台內部審核面。

## 10. Shared Functional Requirements Across The Three Systems

### 10.1 Identity and role discipline

- `Platform Admin`、`Ops Console`、`Tenant Console` 都必須讀 identity context。
- UI 顯示可依權限變化，但後端 RBAC 才是最終守門。
- 租戶系統若正式產品化，不應延續 demo cookie role 方案。

### 10.2 Request traceability

- 重要 command 應保留 request id。
- 需要冪等的 POST command 應走 idempotency discipline。

### 10.3 Download discipline

- report / invoice / package / artifact 下載應使用短效 signed URL。
- 前端不應把 artifact URL 當長期固定連結保存。

### 10.4 Error handling

- 應顯示 backend error envelope 的 message / retryable 語意。
- 高風險 command 應有明確失敗狀態與恢復建議。

### 10.5 Timeline and evidence preservation

- complaint、incident、reconciliation、audit 都應保留 timeline/evidence 思維。
- reopen 不得覆蓋先前紀錄。

## 11. Recommended Implementation Order If We Materialize This In Repo

### 11.1 Platform Admin

1. Tenant governance hardening
2. Partner entry governance hardening
3. Fleet / compliance workflows
4. Public info / placard governance
5. Pricing / payments / reconciliation
6. Audit / health / notices polish

### 11.2 Ops Console

1. Dispatch owned / forwarded board completion
2. Callcenter workflow completion
3. Complaints and incidents workflow completion
4. Revenue and reporting review completion
5. Attendance / maintenance / registry refinement

### 11.3 Tenant Console

1. Topology decision 已於 `2026-05-08` 採納
   - live production tenant UI 暫維持外部 `tenant-commute-hub`
   - 本 repo 正式產品化 target 為規劃中的 `apps/tenant-console-web`
   - `apps/tenant-portal-web` 繼續維持 sunset reference shell
2. 建立正式 auth / identity bootstrap
3. Productize booking flow
4. Productize passenger / address / user management
5. Productize webhook / API key / notifications / SLA
6. Productize billing / reports / audit
7. 補 partner booking mode

## 12. Final Product Boundaries

### 12.1 Platform Admin owns

- platform-level governance
- tenant onboarding and rollout
- partner entry and credentials
- compliance registry governance
- policy publication
- platform notices and maintenance
- platform audit and observability

### 12.2 Ops Console owns

- real-time dispatch operations
- call center and callback work
- complaints and incidents
- ops review of revenue mismatches
- day-to-day fleet availability monitoring

### 12.3 Tenant Console owns

- tenant self-service
- booking request initiation and tracking
- tenant master data maintenance
- tenant integration setup
- tenant reporting and invoice access

### 12.4 Driver App owns

- task execution
- trip state progression
- proof capture
- SOS
- platform presence
- shift punch-in / punch-out
- driver settings and earnings visibility

### 12.5 Adjacent reopened surfaces

- `apps/tenant-console-web` only owns `Partner Booking Mode` as a constrained business-plane
  sub-surface.
- `apps/passenger-web` owns first-party passenger booking / status / receipt / trip-history
  journeys when that channel is present.
- `apps/assisted-entry-web` owns `Call Point Mode` and `Concierge Mode`; `Ops Console` keeps the
  internal callcenter / complaint / callback control-plane workspace.
- `Platform Admin /switchboard` owns public-info and placard governance, but it does not become
  the passenger status or ROC live-board surface.

## 13. Source References

- `apps/platform-admin-web/app/*`
- `apps/ops-console-web/app/*`
- `apps/driver-app/app/*`
- `apps/tenant-console-web/app/*`
- `apps/tenant-portal-web/app/*`
- `apps/api/src/modules/*`
- `packages/api-client/src/index.ts`
- `packages/contracts/src/index.ts`
- `docs/01-decisions/SD-DP-20260508-004-tenant-console-productization-topology.md`
- `docs/01-decisions/SD-DP-20260509-005-full-system-ui-surface-topology.md`
- `docs/00-context/current-system-blueprint-alignment-audit-20260421.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`
- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/03-runbooks/tenant-onboarding-rollout-runbook.md`
- `docs/03-runbooks/reconciliation-issue-workflow-runbook.md`
- `docs/03-runbooks/phase1-productization-execution-packet-20260428.md`

## 14. Hand-off Note

本文件故意不定義視覺語言。
對 Claude Design 的建議是：

- `Platform Admin` 以治理、版本、審批、風險揭露為主
- `Ops Console` 以 queue、例外、優先級、跨模組跳轉為主
- `Tenant Console` 以自助操作、整合設定、清晰狀態追蹤為主

若後續進入實作，應以本文件作為功能和流程基線，再另外產出：

- sitemap
- page-by-page component spec
- API mapping sheet
- implementation backlog
