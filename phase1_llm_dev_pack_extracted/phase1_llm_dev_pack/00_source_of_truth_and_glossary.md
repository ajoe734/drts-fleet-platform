# 00. Source of Truth + 名詞字典 + 欄位主責

## 0.1 目的

本文件用來解決三種常見錯誤：

1. 同一個名詞被不同 agent 解讀成不同意思
2. 多份文件衝突時，不知道該信哪一份
3. 不知道某個欄位、狀態或事件到底由哪個模組負責寫入與維護

本文件是 **LLM coding 前置必讀**。

---

## 0.2 文件優先序（由高到低）

| 優先序 | 文件 / 來源                                               | 用途                                                           | 衝突時處理方式                              |
| ------ | --------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------- |
| 1      | 使用者最新明確指示                                        | 最高優先產品決策                                               | 直接覆蓋以下所有文件                        |
| 2      | `phase1_prd_detailed_v1.md`                               | 產品需求與語意基準                                             | 若與 SD / API / migration 衝突，以 PRD 為準 |
| 3      | `phase1_system_analysis_v1.md`                            | 邊界、商業模式、角色與合規前提                                 | 若 PRD 未細化，回到 SA                      |
| 4      | `phase1_system_design_v1.md`                              | domain/service 邊界、runtime 與責任切分                        | 不可反向改寫 PRD 語意                       |
| 5      | `phase1_service_contracts_v1.md`                          | service ownership / source of truth / command-query-event 契約 | 若與 SD 衝突，以 SD 為準                    |
| 6      | `phase1_openapi_v1.yaml` / `phase1_openapi_skeleton.yaml` | API 介面草案                                                   | 若與 PRD / SD 衝突，先修 OpenAPI            |
| 7      | `phase1_db_migration_bundle/*` / DDL 草稿                 | DB 落地層                                                      | 若與 PRD / SD 衝突，先修 migration          |
| 8      | 既有 Lovable Prompt 頁面骨架                              | UI / page skeleton                                             | 不可獨自決定交易語意                        |
| 9      | 本 LLM Dev Pack                                           | 最後一批執行約束                                               | 只補足，不推翻上層文件                      |

### 強制規則

- **PRD 決定語意，SD 決定實作邊界，OpenAPI/DDL 只是落地。**
- LLM 不得因為某支 API 已存在，就自行推翻 PRD 的業務規則。
- Lovable 頁面 prompt 只代表 **頁面骨架**，不代表交易語意最終版。

---

## 0.3 不可誤解規則（Hard Rules）

1. `owned` 與 `forwarded` 是兩個不同的訂單域，**不可共用同一套 lifecycle**。
2. `standard_taxi` 與 `business_dispatch` 是 Phase 1 唯二正式產品桶；`av_pilot` 僅保留，不啟用。
3. Phase 1 的供給池分類主軸是 **商業產品 + 派單語意 + 法規資格**，不是油車 / 電車。
4. `complaint_case` ≠ `incident` ≠ `notification` ≠ `audit_log`。
5. `dispatch_trace_log` 是不可變更派遣留痕，不得被 update-only 模式覆蓋。
6. `business_dispatch` 之下先只支援兩種子產品：
   - `credit_card_airport_transfer`
   - `enterprise_dispatch`
7. 第三方平台單由外部平台主導商品語意與最終接單結果；我方只做 `forwarder hub`。
8. Driver App 是 Phase 1 唯一人駕履約終端；但 `call center`、`tenant portal`、`ops console` 都可建單或查看訂單。
9. 任何會影響定價、分帳、Webhook、權限、排他資格、公開費率版本的操作都必須進 audit。
10. 未經人類決策，不得新增新的 `service_bucket`、`order_domain`、`dispatch_semantics`。

---

## 0.4 Canonical 名詞字典

### 0.4.1 商業與組織

#### `tenant`

平台內被獨立隔離的 B2B 業務主體。  
例：大型公司、信用卡合作方、社區 / 飯店 / 醫院合作單位。

**不是**：第三方叫車平台本身。

#### `partner`

較高層商業合作對象，可用於表示：

- dispatch partner
- external forwarder partner
- fleet company partner
- payment / invoice / CTI / map provider

#### `site`

tenant 轄下的實體據點。  
例：企業總部、醫院分院、飯店櫃台。

#### `call_point`

可代叫或上下車的點位。  
例：社區警衛室、飯店禮賓台、固定上車點。

#### `operating_area`

法規與派遣可服務區域判斷用的營業區域。  
所有 owned 派單都要檢查 operating area eligibility。

---

### 0.4.2 車輛、駕駛、資格

#### `vehicle`

營運車輛主檔。  
核心識別：`vehicle_id`, `plate_no`, `vin`

#### `vehicle_reg_profile`

車輛的合規屬性與營運資格。  
例：營業區域、牌照類別、dispatchable flag、branding version、placard version

#### `driver`

司機主檔。  
不是登入帳號本身；登入帳號只是身份憑證。

#### `driver_reg_profile`

司機法規資格、證照、訓練與停權資訊。

#### `qualification_profile`

產品履約資格集合。  
描述某類訂單可由哪一種 `license_class`, `vehicle_form`, `service_tags` 承接。

---

### 0.4.3 產品與規則

#### `service_bucket`

平台內部產品桶。  
Phase 1 固定只有：

- `standard_taxi`
- `business_dispatch`

#### `dispatch_semantics`

派單語意。  
只允許：

- `realtime`
- `reservation`
- `queue`
- `forwarder_broadcast`

#### `contract_rule`

租戶 / 合作方案對系統規則的具體約束。  
例如：能否改單、免費等候多久、是否需簽收。

#### `sla_template`

與時效有關的系統規則模板。  
例如：取消截止、準時到場要求、complaint 回應 SLA。

---

### 0.4.4 訂單與履約

#### `order`

正式交易主體。  
所有派單、話務、申訴、結算都應能回溯到 order。

#### `booking`

預約資訊補充節點。  
只有預約型訂單才有 booking；即時單可以沒有。

#### `dispatch_job`

訂單在派遣器中的執行個體。  
用於追蹤 matching / reserve / queue / fail / redispatch。

#### `dispatch_attempt`

每次派單嘗試。  
**永遠 append-only**。

#### `dispatch_assignment`

正式指派結果。  
包含車、司機、accepted / arrived / started / completed 時點。

#### `trip`

實際履約主體。  
一筆 owned 訂單通常對應一筆 trip；若外部 forwarder 單則 trip 可能只是鏡像。

#### `proof_bundle`

收尾存證集合。  
照片、簽名、停車費、過路費、固定價佐證都屬於此。

---

### 0.4.5 話務、申訴、報表

#### `call_session`

每一通電話的主索引。  
叫車電話與申訴電話都算。

#### `call_recording`

錄音檔索引，不等於錄音實體檔本身。

#### `complaint_case`

正式客服 / 消費爭議案件。  
有案件編號、分類、處理人、SLA、結案原因。

#### `dispatch_trace_log`

不可變更派遣留痕。  
重要事件、位置、載客狀態、來源通道都記這裡。

#### `filing_package`

監理查核 / 立案輸出包。

---

## 0.5 Canonical Enum Registry

### 0.5.1 `order_domain`

| 值          | 定義                                                   |
| ----------- | ------------------------------------------------------ |
| `owned`     | 平台擁有派單與履約控制權                               |
| `forwarded` | 平台只做代理轉送與同步，外部平台擁有最終商品與接單語意 |

### 0.5.2 `service_bucket`

| 值                  | 定義                                     |
| ------------------- | ---------------------------------------- |
| `standard_taxi`     | 一般計程車即時 / 一般預約 / 定點一般單   |
| `business_dispatch` | 信用卡機場接送、企業派車、VIP 預約型履約 |

### 0.5.3 `dispatch_semantics`

| 值                    | 定義                   |
| --------------------- | ---------------------- |
| `realtime`            | 立即媒合與指派         |
| `reservation`         | 預約 / 預派 / 鎖車     |
| `queue`               | 站點 queue/rank 規則   |
| `forwarder_broadcast` | 第三方平台單之廣播轉送 |

### 0.5.4 `order_source`

| 值                  | 定義                |
| ------------------- | ------------------- |
| `app`               | 自有乘客 App        |
| `web`               | 自有乘客 Web        |
| `phone`             | 電話 / CTI          |
| `api`               | B2B API             |
| `portal`            | 租戶 / 企業 Portal  |
| `concierge`         | 定點代叫 / 櫃台代叫 |
| `external_platform` | 第三方平台 inbound  |

### 0.5.5 `business_dispatch_subtype`

| 值                             | 定義                      |
| ------------------------------ | ------------------------- |
| `credit_card_airport_transfer` | 信用卡權益 / 禮賓機場接送 |
| `enterprise_dispatch`          | 大型企業派車              |

### 0.5.6 `driver_work_state`

| 值                   | 定義                   |
| -------------------- | ---------------------- |
| `logged_out`         | 未登入或未啟動工作     |
| `ready_offline`      | 已登入但未上線接單     |
| `available_standard` | 可接 standard_taxi     |
| `available_business` | 可接 business_dispatch |
| `available_hybrid`   | 兩者都接               |
| `reserved`           | 已被預約型任務鎖定     |
| `enroute`            | 前往接客               |
| `on_trip`            | 載客中                 |
| `paused`             | 暫停接單               |
| `incident_hold`      | 事故 / 異常停單        |
| `suspended`          | 資格不符，系統停派     |

### 0.5.7 `complaint_category`

| 值                  |
| ------------------- |
| `late_arrival`      |
| `no_arrival`        |
| `driver_service`    |
| `vehicle_condition` |
| `route_issue`       |
| `fare_dispute`      |
| `safety_concern`    |
| `lost_and_found`    |
| `other`             |

---

## 0.6 欄位主責（Source of Truth Matrix）

| 欄位 / 主體                                   | Source of Truth               | 可寫入模組                           | 備註                         |
| --------------------------------------------- | ----------------------------- | ------------------------------------ | ---------------------------- |
| `tenant.name`, `tenant.code`, quotas, modules | PlatformCo Admin              | Admin only                           | tenant code 唯一             |
| `vehicle.plate_no`, `vehicle.vin`             | Regulatory Registry / Admin   | Admin, approved ops import           | 核准前不可 dispatchable      |
| `driver.name`, `driver.mobile`                | Regulatory Registry           | Ops backoffice, approved import      | App 只能讀自己               |
| `contract_rule`, `sla_template`               | Product/Rule service          | Admin, limited finance/compliance    | 版本化                       |
| `order.current_status` for owned              | Order / Dispatch domain       | Order, Dispatch, Driver Task         | 不可由 Portal 直接寫最終狀態 |
| `order.current_status` for forwarded          | Forwarder domain              | Forwarder adapter only               | UI 只能鏡像顯示              |
| `call_session.recording_id`                   | Callcenter service            | CTI webhook / callcenter             | 電話建單必須綁               |
| `dispatch_trace_log`                          | Dispatch Trace domain         | system append only                   | 不可改寫                     |
| `complaint_case.status`                       | Complaint service             | complaint specialist / permitted ops | 不可由 incident service 覆蓋 |
| `driver_statement.net_amount`                 | Billing service               | finance jobs only                    | App 只讀                     |
| `public_info_version`                         | PlatformCo Admin / compliance | admin only, four-eyes                | 發布需 audit                 |
| `filing_package.status`                       | Reporting / Filing service    | reporting jobs only                  | 由 job lifecycle 維護        |

---

## 0.7 欄位可見性與遮罩基準

| 資料                 | PlatformCo         | Tenant Admin   | OpCo     | Complaint | Driver         | Host          |
| -------------------- | ------------------ | -------------- | -------- | --------- | -------------- | ------------- |
| 完整乘客電話         | 受限               | 受限           | 受限     | 受限      | 遮罩或匿名撥號 | 不可見        |
| 錄音下載             | 稽核/法遵/授權客服 | 不可           | 受限     | 受限      | 不可           | 不可          |
| 發票 PDF             | 平台財務           | 租戶管理員     | 受限     | 不可      | 不可           | 不可          |
| 司機收益明細         | 平台財務           | 不可           | 受限     | 不可      | 自己 בלבד      | 自車聚合 only |
| 排他委託佐證         | 平台法遵           | 不可           | 受限     | 不可      | 不可           | 自車 only     |
| audit old/new values | 稽核               | 租戶範圍內摘要 | 受限摘要 | 不可      | 不可           | 不可          |

### 遮罩規則

- 電話：預設只顯示末 3 碼
- Email：預設只顯示首 2 + domain
- 錄音 URL：永不落前端持久儲存
- 匯出檔若含個資，必須記錄 export audit

---

## 0.8 典型衝突案例與判定

### 案例 A：第三方平台 inbound order 有 pickup/dropoff，也想進自有 dispatch

**判定：不可。**  
如果來源是 `external_platform`，預設必為 `order_domain=forwarded`，不得直接走 `owned` 派單。

### 案例 B：企業派車單也顯示 ETA，看起來像一般叫車

**判定：仍是 `business_dispatch`。**  
顯示 ETA 不代表它是 standard_taxi；判斷應看 `service_bucket` 與 `dispatch_semantics`。

### 案例 C：電話申訴被建成 incident

**判定：不合格。**  
incident 是營運異常；申訴必須建立 `complaint_case`。

### 案例 D：司機 App 完成任務時直接把 order 改成 completed

**判定：不可直接寫 order。**  
App 只能送 command；由 backend 驗證 proof 後更新 `trip` / `assignment` / `order`。

---

## 0.9 LLM 禁止自行發明的內容

LLM 不得自行新增以下內容，除非有人類明確批准：

- 新的 `service_bucket`
- 新的 `order_domain`
- 新的 `dispatch_semantics`
- 新的 `business_dispatch_subtype`
- 新的 pricing formula 類型
- 新的 complaint lifecycle 主狀態
- 新的 filing package 類型
- 新的 source-of-truth owner

---

## 0.10 變更控制規則

以下變更必須先有產品 / 架構決策紀錄（ADR / PDR）：

- 調整 product mapping 邏輯
- 改動 order lifecycle
- 讓 forwarded 單進 owned 核心
- 新增商務子產品
- 更改 driver billing 模型
- 更改 complaint SLA 類別或時限
- 更改 export / retention policy
