# Phase 1 角色、使用情境與負流程盤點矩陣

狀態：SA supplemental matrix  
日期：2026-04-30  
適用範圍：`drts-fleet-platform`、`tenant-commute-hub`

## 1. 文件目的

本文件補足 `phase1_system_analysis_v1.md`、`docs/02-architecture/phase1-operational-sa-gap-supplement-20260429.md`
與 `docs/02-architecture/phase1-operational-system-design-blueprint-20260429.md`
先前偏重主流程盤點、對角色矩陣與負流程矩陣不夠顯性化的問題。

本文件的任務不是重寫既有 SA，而是把 Phase 1 應該回答的三件事一次講清楚：

1. 系統裡到底有哪些角色
2. 每個角色到底有哪些使用情境
3. 每個情境的正流程與負流程，目前系統做到哪裡、缺哪裡

本文件也是後續 PRD、SD、runbook、UAT、E2E 與 execution backlog 的角色與情境基準。

## 2. 盤點方法

本次盤點不是只看文件，而是依下列資料交叉整理：

- `phase1_system_analysis_v1.md`
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/02_acceptance_scenarios_gherkin.md`
- `apps/platform-admin-web/app/*`
- `apps/ops-console-web/app/*`
- `apps/driver-app/app/*`
- `apps/api/src/modules/*`
- `/home/edna/workspace/tenant-commute-hub/src/*`

盤點原則：

- 先列出所有 human roles 與 machine/system actors
- 再列出所有有商業意義的使用情境
- 每個情境都要同時盤點 positive path 與 negative / exception path
- 最後再回頭看各系統面有沒有真的覆蓋這些情境

## 3. 角色總表

### 3.1 外部人類角色

| 角色                               | Realm                  | 主要系統面                               | 主要目標                                      | 目前狀態                                           |
| ---------------------------------- | ---------------------- | ---------------------------------------- | --------------------------------------------- | -------------------------------------------------- |
| `passenger`                        | external consumer      | Passenger App / Web / phone / call point | 建立乘車需求、看 ETA、取消、收據、申訴        | `deferred`，不在當前 repo 產品化範圍               |
| `tenant_admin`                     | tenant business plane  | `tenant-commute-hub`                     | 管理租戶設定、使用者、預約、報表、SLA、稽核   | `implemented / partial`                            |
| `tenant_ops_admin`                 | tenant business plane  | `tenant-commute-hub`                     | 建立預約、查詢訂單、處理營運通知              | `implemented / partial`                            |
| `tenant_finance_admin`             | tenant business plane  | `tenant-commute-hub`                     | 看 billing、invoice、月結、下載報表           | `implemented / partial`                            |
| `tenant_technical_admin`           | tenant business plane  | `tenant-commute-hub`                     | 發 API key、管理 webhook、看 delivery         | `implemented / partial`                            |
| `tenant_viewer`                    | tenant business plane  | `tenant-commute-hub`                     | 唯讀查看 dashboard、booking、reports、audit   | `partial`                                          |
| `partner_portal_user`              | partner business plane | `tenant-commute-hub` partner mode        | 建立合作方案訂單、查詢 partner 特定 booking   | `implemented / partial`                            |
| `partner_api_client`               | partner ingress plane  | `apps/api`                               | 以 API 建立 partner booking、驗證 eligibility | `implemented / partial`                            |
| `call_point_operator`              | assisted-entry plane   | future portal                            | 現場代叫、管理 call point queue               | `deferred`                                         |
| `concierge_operator`               | assisted-entry plane   | future portal                            | 現場櫃台代叫與旅客服務                        | `deferred`                                         |
| `external_forwarder_platform_user` | external platform      | `forwarder` adapter                      | 送單、接收 sync、處理 lost race / cancel      | `implemented as integration model, not product UI` |
| `driver_user`                      | driver business plane  | `apps/driver-app`                        | 接單、出車、回報事件、完單、看收益            | `implemented / partial`                            |
| `host_user`                        | host read model        | future / limited ops views               | 看自車收益、維保、任務、申訴                  | `partial / not productized`                        |

### 3.2 內部人類角色

| 角色                     | Realm         | 主要系統面                                               | 主要目標                                                 | 目前狀態                 |
| ------------------------ | ------------- | -------------------------------------------------------- | -------------------------------------------------------- | ------------------------ |
| `platform_admin`         | control plane | `platform-admin-web`                                     | 租戶、車隊、pricing、payments、switchboard、audit、flags | `implemented / partial`  |
| `platform_user_admin`    | control plane | `platform-admin-web`                                     | 平台使用者與角色治理                                     | `implemented / partial`  |
| `platform_partner_admin` | control plane | `platform-admin-web`                                     | partner / bank / program / entry 開通                    | `partial`                |
| `dispatcher`             | control plane | `ops-console-web/dispatch`                               | 看待派、候選供給、派遣、改派、重派                       | `implemented / partial`  |
| `ops_supervisor`         | control plane | `ops-console-web`                                        | 監督 queue、exception、SLA、排班與營運健康               | `partial`                |
| `call_center_agent`      | control plane | `ops-console-web/callcenter`                             | 接電話、回 ETA、建 phone order、回撥、轉客訴             | `partial`                |
| `complaint_specialist`   | control plane | `ops-console-web/complaints`                             | 建案、追蹤 SLA、reopen、結案、輸出                       | `implemented / partial`  |
| `incident_operator`      | control plane | `ops-console-web/incidents`                              | 處理事故、營運事件、升級                                 | `partial`                |
| `fleet_admin`            | control plane | `platform-admin-web/fleet`, `ops-console-web/vehicles`   | 管理車輛、保單、契約、dispatchability                    | `partial`                |
| `driver_admin`           | control plane | `platform-admin-web`, API                                | 建立 driver master、停權、綁機、換機                     | `weak / not productized` |
| `finance_user`           | control plane | `platform-admin-web/payments`, `ops-console-web/revenue` | 對帳、發票、司機對帳、補差、付款批次                     | `implemented / partial`  |
| `compliance_user`        | control plane | `platform-admin-web/audit`, reports                      | 錄音、proof、監理輸出、legal hold、下載留痕              | `partial`                |
| `audit_user`             | control plane | `platform-admin-web/audit`, API                          | 稽核高敏感操作與 artifact access                         | `partial`                |

### 3.3 系統 / 機器角色

| 角色                         | 類型                    | 主要責任                                   | 目前狀態                |
| ---------------------------- | ----------------------- | ------------------------------------------ | ----------------------- |
| `reservation_scheduler`      | backend worker          | 商務預約預派、鎖車、升級人工               | `implemented / partial` |
| `realtime_matcher`           | backend worker          | 即時單派遣候選與 attempt 產生              | `implemented / partial` |
| `sla_monitor`                | backend worker          | complaint / order SLA flag 與告警          | `partial`               |
| `billing_job`                | backend worker          | invoice、statement、reimbursement          | `implemented / partial` |
| `filing_generator`           | backend worker          | 月報、監理輸出、artifact package           | `implemented / partial` |
| `recording_callback_sender`  | external callback       | 錄音 ready callback                        | `implemented / partial` |
| `issuer_eligibility_adapter` | external callback / API | bank / issuer eligibility verify           | `demo / external-gated` |
| `forwarder_adapter`          | external adapter        | inbound order、accept、sync-status、cancel | `implemented / partial` |
| `webhook_consumer`           | tenant external system  | 接收 tenant webhook                        | `implemented / partial` |

## 4. 使用情境總表

### 4.1 角色到情境的對映

| 情境家族               | 主要角色                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 身份進入與開通         | `platform_admin`, `driver_admin`, `tenant_admin`, `partner_portal_user`, `partner_api_client`, `driver_user`                          |
| 租戶與合作方治理       | `platform_admin`, `platform_partner_admin`, `tenant_admin`, `tenant_technical_admin`, `tenant_finance_admin`                          |
| 進單與建立需求         | `passenger`, `tenant_ops_admin`, `partner_portal_user`, `partner_api_client`, `call_center_agent`, `external_forwarder_platform_user` |
| 派遣與履約             | `dispatcher`, `ops_supervisor`, `driver_user`, `reservation_scheduler`, `realtime_matcher`                                            |
| 客訴、事故、營運例外   | `complaint_specialist`, `incident_operator`, `call_center_agent`, `dispatcher`                                                        |
| 財務、報表、監理、稽核 | `finance_user`, `compliance_user`, `audit_user`, `tenant_finance_admin`                                                               |
| API、Webhook、整合     | `tenant_technical_admin`, `partner_api_client`, `external_forwarder_platform_user`, `webhook_consumer`                                |

### 4.2 情境清單

本次盤點把 Phase 1 使用情境收成 26 個 scenario families：

1. 平台使用者登入與 control-plane 存取
2. 租戶 bootstrap 與 tenant user invitation
3. 司機 master 建立、啟用、停權、退役
4. 司機裝置註冊、綁機、換機、撤銷
5. 車輛 / 契約 / 保單 / 排他資格建立與失效
6. partner / bank / program / entry 開通
7. tenant portal 建立一般 business booking
8. partner portal / partner API 建立機場接送 booking
9. 地址不可解析、資料不完整、eligibility 不通過時的建單失敗
10. 電話進線、CTI、錄音、phone order 建立
11. 錄音延遲、錄音缺失、callback 失敗
12. external forwarder inbound order 與 mirror lifecycle
13. 外部平台 lost race / cancel / sync-failed
14. order 進 queue、reservation 轉 active queue
15. 派遣成功、候選過濾、指派 driver
16. 派不到車、候選為空、服務區不可派
17. 改派、重派、reject、timeout、exception_hold
18. driver accept / reject / depart / arrive / start / complete
19. proof、signoff、photo、expense proof 不足
20. complaint 建案、reopen、SLA breach
21. incident 建案、營運升級、人工 override
22. tenant invoice、driver statement、補差與 payout
23. channel-aware reconciliation 與 partner benefit settlement
24. reports / filing / recording index export
25. API key / webhook 發行、輪替、撤銷、delivery log
26. 敏感 artifact 下載、遮罩、稽核與 legal hold

## 5. 情境矩陣：正流程與負流程

### 5.1 身份與開通

| 情境                | 主要角色                                       | 正流程                                             | 負流程 / 例外                                                               | 主要系統                                               | 目前覆蓋度                   |
| ------------------- | ---------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------- |
| 平台使用者登入      | `platform_admin`, `dispatcher`, `finance_user` | 經 IAP / control-plane auth 進入後台               | token 缺失、錯 audience、realm 混淆、bootstrap header 誤用                  | `platform-admin-web`, `ops-console-web`, `apps/api`    | `implemented / partial`      |
| 租戶 bootstrap      | `tenant_admin`                                 | 受邀、bootstrap session、進入 tenant hub           | invitation 過期、wrong tenant、role mismatch、session restore drift         | `tenant-commute-hub`, `apps/api`                       | `implemented / partial`      |
| 司機主檔建立        | `driver_admin`                                 | 建立 driver master，補證件，啟用可派資格           | 重複身份、證件過期、未綁 service bucket、停權後仍可派                       | `apps/api`, `platform-admin-web`                       | `weak`                       |
| 司機裝置綁定        | `driver_user`, `driver_admin`                  | device registration -> backend token -> app 可進入 | 無 device token、換機未撤銷舊機、遺失裝置仍可 refresh、停權 driver 仍可登入 | `apps/driver-app`, `apps/api`                          | `weak / currently dev-heavy` |
| 車輛與供給開通      | `fleet_admin`                                  | 建立 vehicle / insurance / contract / exclusivity  | 保單到期仍可派、排他審核未過仍可 dispatchable、offboarding 未去品牌         | `apps/api`, `platform-admin-web`, `ops-console-web`    | `partial`                    |
| partner / bank 開通 | `platform_partner_admin`                       | 建立 partner -> program -> entry -> credential     | seed-only 開通、slug 衝突、inactive entry 仍可用、wrong tenant scope        | `apps/api`, `platform-admin-web`, `tenant-commute-hub` | `partial`                    |

### 5.2 進單與建立需求

| 情境                    | 主要角色                                    | 正流程                                                 | 負流程 / 例外                                                                | 主要系統                         | 目前覆蓋度                 |
| ----------------------- | ------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------- | -------------------------- |
| tenant business booking | `tenant_ops_admin`                          | 建立 `business_dispatch` reservation booking           | past modifiable window、contract 不允許、地址不可解析                        | `tenant-commute-hub`, `apps/api` | `implemented / partial`    |
| partner airport booking | `partner_portal_user`, `partner_api_client` | 以 partner context 建立 `credit_card_airport_transfer` | flight number 缺失、benefit ref 無效、entry inactive、wrong tenant / partner | `tenant-commute-hub`, `apps/api` | `implemented / partial`    |
| 地址解析                | `tenant_ops_admin`, `call_center_agent`     | geocode 成功後建單                                     | `ADDRESS_UNRESOLVABLE`、落在不可服務區、地址與 operating area 不一致         | `tenant-commute-hub`, `apps/api` | `partial`                  |
| phone order             | `call_center_agent`                         | call session -> order -> queue -> dispatch             | recording 缺失、call_id 未綁、agent_id 缺失、callback 晚到                   | `ops-console-web`, `apps/api`    | `backend stronger than UI` |
| forwarder inbound order | `external_forwarder_platform_user`          | inbound -> mirror order -> broadcast -> sync           | lost race、cancelled_by_platform、sync_failed、adapter down                  | `apps/api`, `apps/driver-app`    | `implemented / partial`    |

### 5.3 派遣與履約

| 情境            | 主要角色                                                  | 正流程                                                        | 負流程 / 例外                                                                   | 主要系統                                         | 目前覆蓋度              |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------- |
| order 進 queue  | `dispatcher`, `realtime_matcher`, `reservation_scheduler` | `ready_for_dispatch` 或 reservation 進 operational projection | `recording_pending`、`exception_hold`、`redispatch_required`、not serviceable   | `apps/api`, `ops-console-web`                    | `partial`               |
| 派遣成功        | `dispatcher`                                              | 候選過濾 -> assignment -> driver task                         | 候選 driver / vehicle 不合格、ETA 過舊、race condition                          | `apps/api`, `ops-console-web`, `apps/driver-app` | `implemented / partial` |
| 無供給可派      | `dispatcher`, `ops_supervisor`                            | queue 中標示 delayed / failed 並升級                          | UI 誤顯示假 ETA、訂單卡死、無法明確區分 area unavailable vs temporary no supply | `apps/api`, `ops-console-web`                    | `partial`               |
| 重派 / 改派     | `dispatcher`                                              | cancel current assignment -> new attempt -> audit trace       | reject reason 缺失、timeout 後未保留歷史、人工 override 無 reason code          | `apps/api`, `ops-console-web`                    | `partial`               |
| 地圖派遣        | `dispatcher`, `call_center_agent`                         | 地圖看供給、點選位置、輔助派遣                                | 沒即時位置、地圖與 truth 分裂、人工只憑口頭處理                                 | `ops-console-web`, `tenant-commute-hub`          | `weak`                  |
| driver 任務執行 | `driver_user`                                             | accept -> depart -> arrive -> start -> complete               | reject 無原因、未到上車點即 start、fixed price 改價、proof 不足                 | `apps/driver-app`, `apps/api`                    | `implemented / partial` |

### 5.4 客訴、事件、合規

| 情境                         | 主要角色                                                     | 正流程                                         | 負流程 / 例外                                                                       | 主要系統                                         | 目前覆蓋度                     |
| ---------------------------- | ------------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------ |
| complaint 建案               | `complaint_specialist`, `call_center_agent`                  | 建 complaint case、關聯 order / call、設 SLA   | 被錯當 incident、無正式 case number、reopen 無歷史                                  | `ops-console-web`, `apps/api`                    | `implemented / partial`        |
| incident 建案                | `incident_operator`, `driver_user`                           | 事件上報、指派、升級                           | 與 complaint lane 混淆、沒有 owner、無 escalation trace                             | `ops-console-web`, `apps/api`, `apps/driver-app` | `partial`                      |
| proof / signoff / expense    | `driver_user`, `dispatcher`, `compliance_user`               | contract rule 載入 proof requirement，完單驗證 | `PROOF_REQUIRED`、`EXPENSE_PROOF_REQUIRED`、`MIN_PHOTO_COUNT_NOT_MET` 被繞過        | `apps/api`, `apps/driver-app`                    | `backend stronger than app UX` |
| recording / eligibility gate | `call_center_agent`, `partner_api_client`, `compliance_user` | gate 通過才可安全往下                          | recording pending 被默默派出、eligibility verify 失敗卻仍建單、override 無 reviewer | `apps/api`, `ops-console-web`                    | `partial`                      |
| 敏感下載與 legal hold        | `audit_user`, `compliance_user`                              | signed URL + audit                             | 未授權下載、masking 不一致、download 無留痕、legal hold 被刪除覆蓋                  | `apps/api`, `platform-admin-web`                 | `partial`                      |

### 5.5 財務、報表、整合

| 情境                   | 主要角色                                 | 正流程                                                | 負流程 / 例外                                                             | 主要系統                                               | 目前覆蓋度              |
| ---------------------- | ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------- |
| tenant invoice         | `tenant_finance_admin`, `finance_user`   | billing period -> invoice -> artifact download        | invoice line 漏單、錯 tenant、已作廢單仍入帳                              | `apps/api`, `tenant-commute-hub`, `platform-admin-web` | `implemented / partial` |
| driver statement       | `driver_user`, `finance_user`            | completed trips -> statement -> app 可看              | cross-driver data 泄漏、補差錯算到 driver 承擔                            | `apps/api`, `apps/driver-app`, `platform-admin-web`    | `implemented / partial` |
| channel reconciliation | `finance_user`, `platform_partner_admin` | tenant / partner / phone / forwarder 分渠道對帳       | payer / sponsor / reimbursement 邏輯混淆、shadow ledger 與 truth 不一致   | `apps/api`, `ops-console-web`, `platform-admin-web`    | `partial`               |
| regulatory exports     | `compliance_user`, `audit_user`          | report / filing package / recording index 下載        | artifact 缺 manifest、phone order 漏 call_id/recording_id、留存政策不一致 | `apps/api`, `ops-console-web`, `tenant-commute-hub`    | `implemented / partial` |
| API keys / webhooks    | `tenant_technical_admin`                 | issue once, mask later, rotate, revoke, delivery logs | plaintext 重複可見、rotation 後仍用舊 secret、delivery 無歷史             | `tenant-commute-hub`, `apps/api`                       | `implemented / partial` |

## 6. 依角色盤點：誰最需要負流程

### 6.1 高負流程密度角色

下列角色如果只盤正流程，系統幾乎一定會失真：

- `driver_admin`
- `call_center_agent`
- `dispatcher`
- `complaint_specialist`
- `compliance_user`
- `finance_user`
- `partner_api_client`
- `driver_user`

原因是這些角色的日常工作，本來就不是「一路順到完單」，而是大量處理：

- 缺件
- 失敗
- 延遲
- 駁回
- 重派
- override
- reopen
- reconciliation
- 敏感存取

### 6.2 先前盤點明顯不足的區塊

本次回頭看，先前若只列主流程，最容易漏掉的是：

1. `司機怎麼進 App`
2. `司機被停權、換機、證件過期時怎麼處理`
3. `partner entry inactive / wrong scope / invalid key 時要怎樣拒絕`
4. `電話錄音還沒回來時訂單到底能不能派`
5. `派不到車、被拒單、timeout 後操作員怎麼接手`
6. `proof / signoff / expense proof 不足時，driver app 與 ops 誰處理`
7. `forwarder lost race / sync_failed 時怎麼 reconcile`
8. `敏感 artifact 被下載、匯出、legal hold 時怎麼控權`

## 7. 依系統面稽核：角色與情境覆蓋度

### 7.1 `platform-admin-web`

#### 覆蓋較好的角色與情境

- `platform_admin`
- `platform_user_admin`
- `finance_user`
- `compliance_user`
- tenant、pricing、payments、audit、health、feature flags、partner page

#### 主要缺口

- `driver_admin` 幾乎沒有完整主檔與裝置 lifecycle
- `platform_partner_admin` 有入口，但還不是完整 partner program / entry onboarding console
- 缺少負流程明文化：
  - partner inactive / revoke / rollback
  - driver suspend / retire / device revoke
  - insurance expiry / exclusivity rejection

#### 判斷

- 正流程覆蓋：`中高`
- 負流程覆蓋：`中低`

### 7.2 `ops-console-web`

#### 覆蓋較好的角色與情境

- `dispatcher`
- `complaint_specialist`
- `incident_operator`
- `finance_user` 的 revenue review
- queue / dispatch / complaints / incidents / reports / revenue 基本面

#### 主要缺口

- `call_center_agent` 缺完整建單工作台
- map-driven dispatch 幾乎沒有
- exception_hold / manual override / recording gate 的操作閉環不夠完整
- 派不到車、延遲、人工接手的 UX 還偏弱

#### 判斷

- 正流程覆蓋：`中高`
- 負流程覆蓋：`中`

### 7.3 `driver-app`

#### 覆蓋較好的角色與情境

- `driver_user` 接單、出發、到場、行程、收益、事件上報
- 部分 backend negative guards 已存在：
  - reject reason
  - pickup not arrived
  - fixed price immutable
  - min photo / proof required

#### 主要缺口

- 進入 App 仍偏 internal provisioning，不是 production-grade auth
- proof capture UX 與裝置能力還未完全 productize
- 換機、停權、token refresh、離線/重送等負流程不完整

#### 判斷

- 正流程覆蓋：`中高`
- 負流程覆蓋：`中低`

### 7.4 `tenant-commute-hub`

#### 覆蓋較好的角色與情境

- `tenant_admin`
- `tenant_ops_admin`
- `tenant_finance_admin`
- `tenant_technical_admin`
- `partner_portal_user`
- booking、billing、reports、api keys、webhooks、audit、partner booking funnel

#### 主要缺口

- 地圖元件有，但未進主流程
- partner negative flows 的 UX 說明與 fallback 提示不夠完整
- tenant onboarding / invitation / role lifecycle 還沒有強營運閉環
- passenger / call point 類 assisted-entry 角色未覆蓋

#### 判斷

- 正流程覆蓋：`高`
- 負流程覆蓋：`中`

### 7.5 `apps/api`

#### 覆蓋較好的角色與情境

- 幾乎所有 domain 的正流程骨架都在
- acceptance scenarios 對負流程其實也有不少定義：
  - `ADDRESS_UNRESOLVABLE`
  - `FLIGHT_NO_REQUIRED`
  - `ORDER_NOT_MODIFIABLE`
  - `PROOF_REQUIRED`
  - `EXPENSE_PROOF_REQUIRED`
  - `PICKUP_NOT_ARRIVED`
  - `FIXED_PRICE_IMMUTABLE`
  - `MIN_PHOTO_COUNT_NOT_MET`
  - driver / vehicle eligibility gates

#### 主要缺口

- 有些負流程只有 API / state，沒有對應的 operator UX 與 runbook
- 身份生命週期、合作方開通、device binding、issuer integration 仍未完全 productize
- 某些 negative path 是設計存在，但驗證與 UI 對應不足

#### 判斷

- 正流程覆蓋：`高`
- 負流程覆蓋：`中高`

## 8. 結論

### 8.1 這次重盤後最重要的結論

先前問題不是「完全沒盤負流程」，而是：

- 負流程散落在 acceptance scenarios、backend state、少量 runbook
- 但沒有被整理成「角色 -> 情境 -> 正負流程 -> 系統覆蓋度」這種 SA 等級矩陣

所以讀者會看到：

- domain 很完整
- route 很多
- page 也不少

但還是會問出關鍵問題：

- 司機到底怎麼進系統？
- 電話單到底怎麼處理錄音缺失？
- partner key 壞掉會怎樣？
- 派不到車誰接手？
- proof 不夠時誰卡住、誰放行？

這些都不是白癡問題，而是先前 SA 沒把角色與負流程顯性化。

### 8.2 目前最需要補強的 10 個負流程主題

1. 司機 device registration / revoke / rebind / suspend
2. driver master 停權、證件過期、不可派的營運處理
3. partner entry inactive / wrong tenant / invalid credential 拒絕路徑
4. phone order recording pending / missing / callback failed
5. no supply / delayed / not serviceable 的 operator handling
6. reject / timeout / redispatch / exception_hold 的人工接手閉環
7. proof / signoff / expense proof 缺失的 driver + ops 雙面流程
8. forwarder sync_failed / lost_race / cancelled_by_platform reconciliation
9. sensitive artifact download / masking / legal hold / deletion exception
10. channel-aware finance reconciliation mismatch 與 dispute handling

### 8.3 對後續文件的要求

從這份文件開始，後續任何 PRD、SD、runbook、UAT、execution packet 若只寫正流程，都應視為不完整。

最低要求必須同時回答：

- 這個功能是給誰用？
- 他的成功路徑是什麼？
- 他的失敗、拒絕、延遲、補件、override、reopen、reconcile 路徑是什麼？
- 哪一個系統面負責承接？
- 哪一個角色負責收尾？
