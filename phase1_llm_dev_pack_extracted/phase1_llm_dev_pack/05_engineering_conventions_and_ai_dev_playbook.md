# 05. 工程慣例 + AI Dev Playbook

## 5.1 目的

這份文件不是架構說明，而是 **讓 LLM 寫出一致工程風格** 的工作手冊。  
凡是 SA / PRD / SD 沒明講，但工程實作一定要統一的地方，一律依本文件。

---

## 5.2 Default Engineering Baseline（預設技術基線）

> 除非人類架構師發布 ADR，否則所有 LLM agent 一律假設以下技術基線。

### 5.2.1 Repo

- **monorepo**
- package manager: `pnpm`
- workspace orchestration: `turbo`

### 5.2.2 Frontend

- web apps: `Next.js + TypeScript + React`
- UI component policy: internal shared component library
- state policy:
  - server state → TanStack Query
  - local UI state → React state / reducer
- forms: React Hook Form + Zod resolver

### 5.2.3 Mobile

- driver app: `React Native + TypeScript`
- background location / push / camera 需支援 production native capability
- LLM 不得自行混入 Flutter / Kotlin / Swift 除非人類明確指定

### 5.2.4 Backend

- language: `TypeScript`
- runtime: `Node.js`
- API style: contract-first, HTTP JSON
- validation: `Zod`
- OpenAPI source: from schema / contract package
- background jobs: queue-based workers
- events: message bus topic naming per SD / 本文件

### 5.2.5 Database

- OLTP: `PostgreSQL`
- source of truth for schema: **SQL migration files**
- ORM / query layer 可存在，但 **不得反向作為 schema source of truth**
- cache / ephemeral state: `Redis`
- object storage: S3-compatible

### 5.2.6 Testing

- unit: Vitest / Jest 任選一種，但全 repo 只能一種
- API / integration: supertest / contract tests
- e2e web: Playwright
- mobile e2e: Detoxtype / Maestro 任選一種，但全 app 只能一種

### 5.2.7 CI

- lint
- typecheck
- unit test
- integration test
- OpenAPI lint
- migration verify
- changed-module e2e smoke

---

## 5.3 Repo 結構（預設）

```text
/apps
  /web-tenant
  /web-admin
  /web-ops
  /mobile-driver

/services
  /identity
  /tenant-partner
  /regulatory-registry
  /product-rule
  /order
  /dispatch
  /forwarder
  /driver-task
  /callcenter
  /complaint
  /billing
  /reporting
  /audit-notification

/packages
  /contracts
  /shared-types
  /shared-ui
  /shared-config
  /shared-test-fixtures
  /eslint-config
  /tsconfig

/infrastructure
  /migrations
  /seed
  /docker
  /env
  /observability
```

### 強制規則

- 新功能先放既有 domain，不要先發明新 service。
- `packages/contracts` 只放 schema / DTO / event contract，不放業務邏輯。
- `shared-types` 不得承載 domain rule。

---

## 5.4 命名慣例

### 5.4.1 檔名

- API handler: `*.handler.ts`
- service logic: `*.service.ts`
- repository / query access: `*.repo.ts`
- validator / schema: `*.schema.ts`
- event publisher/subscriber: `*.events.ts`
- test fixture: `*.fixture.ts`

### 5.4.2 變數 / 欄位

- code / JSON / DB 一律 `snake_case` 或 `camelCase` 不能混用同層
- **規則：**
  - TypeScript object keys: `camelCase`
  - JSON over wire: `snake_case`
  - SQL columns: `snake_case`

### 5.4.3 Event name

- 一律小寫 dot-separated
- 範例：
  - `order.created`
  - `dispatch.assigned`
  - `complaint.case.closed`

### 5.4.4 Enum 值

- 一律 `snake_case`
- 不得直接用中文值當 enum

---

## 5.5 API 慣例

1. command endpoint 用 `POST`
2. 不做語意不明確的 giant PATCH
3. list endpoint 一律回 `items + page_info`
4. 所有 POST command 支援 `Idempotency-Key`
5. 錯誤一律使用統一 error envelope
6. download URL 一律短效 signed URL
7. job / export / report 一律 async，不同步大檔生成
8. webhook 一律 HMAC 驗簽

### 不允許

- 前端直接改 order status
- 用 query parameter 表示複雜 command
- 讓同一 endpoint 同時處理 owned 與 forwarded 的相反語意
- 把 UI 顯示文案直接存在核心 API enum

---

## 5.6 DB / Migration 慣例

1. schema source of truth = `/infrastructure/migrations`
2. 每支 migration 必須：
   - 可重放
   - 有明確編號
   - 不依賴手工步驟
3. migration 命名：
   - `V0001__foundation.sql`
   - `V0002__regulatory_registry.sql`
4. seed 分為：
   - reference seed
   - demo operational seed
5. append-only table 不得被 update 覆蓋：
   - dispatch_attempt
   - dispatch_trace_log
   - audit_log
   - webhook_delivery
   - complaint_timeline

### LLM 禁止

- 直接改既有 migration 檔
- 在 production-ready change 中用 `drop table` 當默認解法
- 讓 ORM migration 與 raw SQL migration 雙 source of truth

---

## 5.7 測試慣例

### 5.7.1 測試名稱

- `should_<expected_behavior>_when_<condition>`

### 5.7.2 測試層次

- domain rule → unit
- API contract → integration
- 跨模組流程 → e2e
- 第三方 adapter → replay / fixture test

### 5.7.3 最低測試要求

每個 PR 至少要有：

- 1 個 happy path
- 1 個 validation path
- 1 個 permission / forbidden path（若涉及權限）
- 1 個 audit assertion（若涉及敏感操作）

### 5.7.4 必測模組

- order classification
- dispatch eligibility
- complaint SLA
- driver proof requirement
- forwarder lost race
- billing statement generation
- filing package generation

---

## 5.8 Logging / Tracing 慣例

### 必備欄位

- `request_id`
- `trace_id`
- `actor_id`
- `tenant_id`
- `order_id` / `case_no` / `job_id`（有則帶）
- `event_name`
- `severity`

### 規則

- 不在 log 中印完整 token / secret / full card data / full phone
- 錄音 URL、signed URL、invoice download URL 不進 info log
- adapter inbound/outbound payload 要有 redacted log 版本

---

## 5.9 Secret / Config 慣例

1. secret 不得 hardcode
2. `.env.example` 只放 key 名，不放真值
3. API key / webhook secret / CTI credential / payment credential 一律 secret manager
4. sample payload 可放假 secret，但要明示是假值

---

## 5.10 權限與資料治理慣例

1. 權限在 backend 驗證，不以前端隱藏替代授權
2. 匯出、錄音下載、發票下載都要有 audit
3. 欄位遮罩邏輯必須在 API 層處理，不交由前端決定
4. download URL 最長有效期：15 分鐘
5. webhook secret rotation 必須版本化

---

## 5.11 AI Dev Playbook

### 5.11.1 LLM 啟動前必讀

1. `phase1_system_analysis_v1.md`
2. `phase1_prd_detailed_v1.md`
3. `phase1_system_design_v1.md`
4. `00_source_of_truth_and_glossary.md`
5. `01_decision_tables.md`
6. `03_api_examples_and_error_contracts.md`

### 5.11.2 LLM 實作流程

1. 先確認要改哪個 domain
2. 查 `00` 名詞與 source-of-truth
3. 查 `01` 決策表
4. 查 `02` 是否已有 acceptance scenario
5. 寫 contract / schema / handler / service / tests
6. 若新增外部整合，先比對 `04` sample
7. 最後更新文件索引或 ADR（如果有設計變更）

### 5.11.3 LLM 不得自行決定的事項

- 新增 service bucket
- 修改 order lifecycle
- 修改 complaint category / SLA
- 變更 driver fee formula
- 變更 repo stack
- 變更 migration source of truth
- 讓 forwarded 改走 owned dispatch

### 5.11.4 LLM 必須回報人類的情況

- 需要新增 enum
- 發現 PRD / SD / OpenAPI 互相矛盾
- 實際第三方 payload 與 sample 差異大
- 需要新增安全 / 法規決策
- 需要改 complaint / billing / filing 邏輯
- 需要變更 production data schema 而無明確 migration strategy

### 5.11.5 PR 最低驗收清單

- [ ] 有對應模組與 domain
- [ ] 沒有自行發明新語意
- [ ] 有至少 1 個 happy path 測試
- [ ] 有至少 1 個 negative path 測試
- [ ] 有權限驗證（若相關）
- [ ] 有 audit 驗證（若相關）
- [ ] 有 sample payload 或 fixture 更新（若對外整合）
- [ ] 沒有把 secret、URL、個資印到 log

---

## 5.12 建議分工方式（給多個 LLM agent）

### Agent A

- order / booking / dispatch

### Agent B

- regulatory / complaint / audit

### Agent C

- billing / reports / filing

### Agent D

- web UI integration

### Agent E

- driver app

### Agent F

- third-party adapters / CTI / webhooks

### 規則

- 所有人共用 `packages/contracts`
- 新增 enum 或 event name 需先協調
- DB migration 只能由單一 owner branch 產生，再 rebase others

---

## 5.13 最後原則

LLM 在本專案中最常犯的錯誤不是「不會寫」，而是：

- 偷發明語意
- 偷改狀態機
- 偷混不同 domain
- 偷把畫面骨架當成交易真相

本文件的作用，就是把這四件事先鎖死。
