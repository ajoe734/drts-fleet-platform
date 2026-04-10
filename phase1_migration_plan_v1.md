# Phase 1 Migration & Rollout Plan v1.0

## 1. 文件目的

本文件承接 SD，定義 Phase 1 由「既有頁面骨架 + 新核心後端」走向實際上線的 migration / rollout 計畫。

本文件涵蓋：

1. schema migration 策略
2. service rollout wave
3. data bootstrap / backfill
4. zero-downtime 原則
5. cutover / rollback
6. UAT / pilot / production rollout

---

## 2. 基本假設

1. 前端骨架已存在，但其資料來源 API 仍可調整。
2. 現行營運資料可能散落於：
   - Excel / CSV
   - 舊後台
   - CTI provider
   - 財務系統
   - Driver payout 清單
3. Phase 1 首批會先以上線「人駕派遣 + 商務派車 + 合規 + 話務 + 申訴」為目標，不等待 Phase 2 AV 模組。
4. rollout 需允許租戶、城市、功能模組分批開。

---

## 3. Migration 原則

### 3.1 Expand → Backfill → Dual-write → Switch-read → Contract → Cleanup

所有關鍵 schema 均遵循以下順序：

1. **Expand**
   - 新增 table / column / index
   - 不刪舊欄位
   - 不改寫舊欄位語意

2. **Backfill**
   - 從既有資料來源補入新表
   - 補資料帶來源標記與匯入批次 id

3. **Dual-write**
   - 新流程開始同時寫新資料域
   - 舊流程若仍存在，可保留 mirror write

4. **Switch-read**
   - UI 與 downstream 改讀新真值
   - 舊資料僅保留參考

5. **Contract**
   - 停止舊寫入
   - 封存或隱藏舊欄位 / 舊 API

6. **Cleanup**
   - 完成審計與資料驗證後才真正移除

### 3.2 Schema migration 必須可重入

- 每個 migration 必須可 safely rerun。
- backfill job 必須有 checkpoint。
- 重複執行不可產生重複資料。

### 3.3 高風險 domain 先隔離

以下 domain 不與主交易一起 cutover：

- CTI / recording
- Forwarder
- Billing
- Reporting / filing
- Audit / notification

---

## 4. 發版波次

## Wave 0：Foundation

### 目標

先建立共通底座，不切換任何正式業務。

### 內容

- Identity service
- tenant / partner / site / call point 基礎 schema
- audit append-only store
- object storage bucket
- report job 基礎 framework
- event bus 與 common event envelope
- API gateway / auth middleware

### 交付結果

- 後台可登入
- request id / correlation id / audit id 可追
- 尚未正式接單

---

## Wave 1：Regulatory Registry

### 目標

先把最難人工維持、最需要合規的主資料收進系統。

### 內容

- vehicle
- driver
- vehicle_contract
- insurance_policy
- dispatch_exclusivity
- placard / public info version 基礎

### 資料來源

- Excel 車輛清冊
- Excel 駕駛清冊
- 契約掃描檔
- 保單掃描檔
- 車身揭示版面檔

### 方法

- 先匯入 draft
- 由營運 / 法遵逐筆 review
- approved 後才可 dispatchable=true

### 驗收

- 可產車輛 / 駕駛 / 契約 / 保險清冊
- 可查到效期
- 可做單車單派遣排他審核

---

## Wave 2：Owned Order + Dispatch Core

### 目標

先上自有訂單域，不含 third-party forwarder。

### 內容

- passenger order
- tenant booking
- order classification
- dispatch_job / attempt / assignment
- realtime / reservation / queue
- driver task
- ETA engine
- dispatch trace log

### Read / Write 切換

- 新建單全面寫新 order / dispatch schema
- 既有 UI 清單改讀新 schema
- 舊派單資料僅做參考，不再作真值

### 驗收

- 一般單可派
- 商務預約可預派
- Driver App 可接 / 到場 / 開始 / 完成
- Dispatch Scheduling 看板改讀新真值

---

## Wave 3：Call Center + Complaint

### 目標

把 Phase 1 的 P0 合規缺口補齊。

### 內容

- call_session
- recording index
- phone booking
- callback queue
- complaint_case
- SLA timer
- complaint export view

### 上線順序

1. 先接 CTI incoming call webhook
2. 再接 recording ready callback
3. 再啟用 phone booking
4. 最後導入 complaint hotline 與 case center

### 驗收

- call_id / recording_id / order_id 可互查
- 申訴案件有流水號
- SLA 可追
- 可匯出查核明細

---

## Wave 4：Billing & Settlement

### 目標

把租戶與司機財務整進主平台。

### 內容

- tenant invoice
- passenger receipt
- driver fee plan
- driver statement
- reimbursement batch
- remittance proof

### 上線策略

- 先只產草稿帳單
- 與人工帳務平行兩個結算週期
- 對帳差異在容忍範圍內再切真

### 驗收

- tenant invoice 與財務人工帳一致
- driver statement 與 payout 清單一致
- 補差可回查到訂單與批次

---

## Wave 5：Reports & Filing

### 目標

讓 Phase 1 具備正式查核與立案輸出能力。

### 內容

- regulatory report jobs
- monthly filing jobs
- filing package
- manifest / hash
- long-term archive

### 驗收

- 一鍵輸出清冊
- 一鍵輸出月報
- 一鍵輸出 filing package ZIP/PDF
- 產物可回查來源版本

---

## Wave 6：Forwarder

### 目標

最後才接第三方平台 driver-side forwarder，避免污染 owned 核心。

### 內容

- adapter registry
- inbound external orders
- broadcast relay
- accept relay
- reconciliation

### 驗收

- inbound / native status / local projection 清楚分離
- 外部平台 authoritative 狀態可回查
- sync error 不影響 owned 訂單

---

## 5. Schema Migration 分期

## 5.1 Migration pack A：Foundation

- create schemas
- create enum types
- create audit_log / report_job / artifact / notification tables
- create tenant / partner / site / call_point
- create base indexes

## 5.2 Migration pack B：Regulatory

- create vehicles / drivers / contracts / policies / exclusivity / placards
- create expiry indexes
- create review status indexes

## 5.3 Migration pack C：Orders & Dispatch

- create order / booking / dispatch_job / dispatch_attempt / assignment / trip / trace_log
- create read indexes for booking list / dispatch board / driver inbox

## 5.4 Migration pack D：Callcenter & Complaint

- create call_session / call_recording_index / callback_task / complaint_case / complaint_timeline

## 5.5 Migration pack E：Billing

- create invoice / receipt / fee_plan / statement / reimbursement / remittance_proof

## 5.6 Migration pack F：Reports & Filing

- create report_artifact / filing_package / package_item / public_info_version

---

## 6. Data Bootstrap / Backfill

## 6.1 Regulatory bootstrap

### Source

- 車輛 Excel
- 駕駛 Excel
- 契約 PDF / index
- 保單 PDF / index
- 車身揭示版面

### Job

- `bootstrap_reg_vehicle`
- `bootstrap_reg_driver`
- `bootstrap_contracts`
- `bootstrap_policies`
- `bootstrap_public_info`

### 驗證

- VIN / 車牌唯一
- 同車有效契約不可重疊
- 保單起訖必填
- driver 證照日期合法

---

## 6.2 Passenger / tenant directory bootstrap

### Source

- tenant portal address book
- 企業乘客名單 CSV
- 成本中心對映表

### Job

- `bootstrap_passengers`
- `bootstrap_addresses`
- `bootstrap_cost_centers`

---

## 6.3 Order history bootstrap（可選）

### 原則

- 若舊系統資料品質不足，歷史訂單只做 read-only archive，不強求全量導入新狀態機。
- Phase 1 真值只從 cutover 後開始。

### 建議

- 導 6~12 個月 summary
- 不導完整舊派單狀態機，避免語意污染

---

## 6.4 CTI bootstrap

### Source

- CTI CDR
- recording metadata

### 原則

- 先導近 3 個月
- 只導 metadata，不重搬 raw audio（若 provider 可簽章取用）

---

## 7. 零停機切換策略

## 7.1 Read-side switch

- 先上新 API
- UI behind feature flag
- 租戶 / 城市 / 角色分批切讀

## 7.2 Write-side switch

- 寫入切換時一律以 module flag 控制
- 例如：
  - `flag.phase1.order_core`
  - `flag.phase1.dispatch_core`
  - `flag.phase1.callcenter`
  - `flag.phase1.complaints`
  - `flag.phase1.driver_billing`
  - `flag.phase1.filing`

## 7.3 Dual-run 期間

- Dispatch：1 週以上
- Billing：2 個結算週期
- Complaint：2 週
- Reports / Filing：至少 1 次月報演練

---

## 8. Cutover Plan

## 8.1 Cutover checklist（Owned Order + Dispatch）

1. regulatory approved vehicles > 最低上線量
2. driver valid ratio > 上線門檻
3. ETA provider 健康
4. dispatch board read model ready
5. driver app version minimum reached
6. audit / notification 正常
7. rollback flag 準備完成

## 8.2 切換步驟

1. freeze 舊派單配置變更
2. 啟用新 order_core flag（僅 internal users）
3. 啟用新 dispatch_core flag（僅特定租戶 / 特定城市）
4. 觀察 1~3 天
5. 擴大至所有 owned 訂單
6. 再開放 tenant booking
7. 最後開 passenger app/web

## 8.3 Cutover checklist（CTI）

1. CTI callback signature 驗證完成
2. provider sandbox / prod route 可用
3. recording ready SLA 通過
4. call booking 與 complaint 建案 smoke test 通過

## 8.4 Cutover checklist（Billing）

1. tenant invoice 平行對帳完成
2. driver statement 平行對帳完成
3. reimbursement batch trace 完整
4. invoice PDF / receipt 下載可用

---

## 9. Rollback 策略

## 9.1 原則

- rollback 只回 runtime route，不直接 rollback schema
- 所有 schema migration 採 forward-only
- runtime 問題用 feature flag / traffic routing 回退

## 9.2 Domain rollback

### Order / Dispatch

- 停新建單
- UI 改回舊看板或人工調度
- 保留新資料供事後分析

### Callcenter

- CTI callback 暫停
- 改人工建單 fallback
- 錄音照收，晚點補索引

### Billing

- 停自動出帳
- 回人工帳務
- 保留新系統計算結果做差異分析

### Reporting

- 停自動 package
- 以 read-only query 產臨時報表

---

## 10. 測試與驗證

## 10.1 SIT

- API contract test
- idempotency test
- auth / realm / scope test
- event emission test
- error mapping test

## 10.2 UAT

- tenant booking
- dispatch board assign
- driver accept / depart / complete
- phone booking
- complaint lifecycle
- invoice / statement review
- report generation
- filing package output

## 10.3 Dry run

至少執行 3 次 dry run：

1. owned dispatch dry run
2. CTI + complaint dry run
3. month-end billing + filing dry run

---

## 11. Launch 波次建議

### Pilot A

- 1 個城市
- 1 個 OpCo
- 少量車輛
- business_dispatch 為主

### Pilot B

- 加入 standard_taxi
- 加入 callcenter
- 加入 complaint

### Pilot C

- 加入 driver billing
- 加入 filing package

### Final Phase 1 GA

- 全 owned 訂單
- 合規主檔
- 話務 / 申訴
- billing / reporting
- third-party forwarder 視 readiness 另行上線

---

## 12. 與 Phase 2 的銜接

為避免未來 AV overlay 上線重做：

- vehicle 主檔先保留 automation 欄位
- order.service_bucket 保留 av_pilot
- event bus topic 預留 av namespace
- reporting / audit / filing 不改底座
- driver app / ops console 仍以 feature flag 隱藏 AV 頁

因此 Phase 2 不需重新做 migration，只需：

1. expand AV extension tables
2. 啟用 AV feature flags
3. 加入 telemetry / evidence pipeline
4. 把 ROC live board 與 takeover flow 接上既有交易底座

---

## 13. 上線後 30 天觀察指標

### 營運

- owned orders/day
- dispatch success rate
- redispatch rate
- avg ETA error
- business dispatch punctuality

### 合規

- dispatchable vehicle ratio
- expired cert/policy count
- phone booking recording linkage ratio
- complaint SLA breach count
- filing generation success rate

### 財務

- tenant invoice variance
- driver statement variance
- reimbursement delay count

### 穩定性

- p95 API latency
- driver push delivery success rate
- CTI recording callback lag
- webhook delivery failure rate

---

## 14. 待決議項

1. 舊訂單是否做全量導入，或只保留 archive
2. CTI provider 是否支援錄音檔本體長期保存 API
3. driver payout 是否在 Phase 1 就接銀行實撥
4. passenger app 是否與 owned order 同批上線，或晚一波
5. forwarder 是否 Phase 1 GA 前上，或獨立成 GA+1
