# tenant-commute-hub 前端邊界規則 (Boundary Contract)

Status: canonical boundary contract for tenant-commute-hub  
Task: WA-005 — tenant-commute-hub authority boundary document  
Owner: Claude • Reviewer: Codex  
Created: 2026-04-14  
Supersedes: —

Primary citations:

- `phase1_service_contracts_v1.md` §§3.1–3.13, §7.1
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/03_api_examples_and_error_contracts.md` §§3.2, 3.18, 3.19
- `phase1_llm_dev_pack_extracted/phase1_llm_dev_pack/05_engineering_conventions_and_ai_dev_playbook.md` §§5.4, 5.5
- `docs/02-architecture/authority/rgp-002-authority-map.md` §§4–5
- `docs/02-architecture/authority/rgx-010-tenant-commute-hub-authority-annex-audit-20260422.md`

---

## 0. 文件用途

本文件作為 `tenant-commute-hub`（前端 repo）的唯一邊界參考。它明確列出：

1. 前端可以做什麼（**Allowed**）
2. 前端絕對不可以做什麼（**Forbidden**）

分為五個面向：**Schema**、**API Naming**、**Domain Authority**、**Webhook / Billing / Audit**，以及通用的 **Consumer Obligations**。

> `tenant-commute-hub` 是純 UI consumer。所有業務規則、狀態機、真值由 `drts-fleet-platform` 後端擁有並強制執行。

---

## 1. Schema 面向

### Allowed（允許）

- 在本地前端 TypeScript code 中使用 `camelCase` 作為物件 key（只限於前端 runtime 記憶體）。
- 解析後端回傳的 `snake_case` JSON，在本地顯示層做 camelCase 對應（display-only transformation）。
- 使用後端 API 回傳的 canonical enum 值進行 UI 切換，搭配前端字典（i18n mapping）顯示中文或本地化文字。
- 向後端送出 `snake_case` request body（命令端 payload）。

### Forbidden（禁止）

| #   | 禁止事項                                                                          | 原因                                            | 引用                               |
| --- | --------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------- |
| S-1 | 在送往後端的 request body 中使用 `camelCase` 欄位名稱                             | JSON wire 一律 `snake_case`                     | dev-pack §3.18; conventions §5.4.2 |
| S-2 | 把顯示文案（中文、英文標籤）作為 enum 值送往後端                                  | enum 必須使用 canonical snake_case value        | dev-pack §3.18                     |
| S-3 | 在前端自行定義業務 enum 清單（例如 `order_status`、`dispatch_status`）與後端脫勾  | 只能以後端合約 enum 為準                        | service contracts §§3.5–3.6        |
| S-4 | 對 list 回傳自行 unwrap 成與合約不同的 shape（例如去掉 `items` 層或 `page_info`） | list envelope 必須遵守 `items[] + page_info`    | dev-pack §§3.2.3–3.2.5             |
| S-5 | 在前端 cache 或重組 response，產生與後端 schema 不一致的本地 derived schema       | schema 真值在後端；前端只能顯示、不能派生新真值 | service contracts §7.1             |

---

## 2. API Naming 面向

### Allowed（允許）

- 呼叫 `drts-fleet-platform` 提供的 REST endpoint（依 service contracts §§3.1–3.13 定義路徑）。
- 對 command endpoint（POST）帶 `Idempotency-Key` 以確保冪等安全。
- 對 list endpoint 使用分頁 query 參數（`page`, `page_size`）。
- 使用 `X-Tenant-Code` header 進行 Platform admin 跨租戶操作（限平台管理員角色）。

### Forbidden（禁止）

| #   | 禁止事項                                                    | 原因                                       | 引用                                          |
| --- | ----------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| N-1 | 直接 PATCH `order.current_status` 或任何 status 欄位        | 狀態機在後端；只能呼叫命令 endpoint        | dev-pack §3.19 item 1; conventions §5.5       |
| N-2 | 使用 `trip.complete=true` 或 query param 表達複雜命令語意   | 命令語意必須用 POST command endpoint 表達  | dev-pack §3.19 item 2; conventions §5.5       |
| N-3 | 對 forwarded 訂單使用 owned assignment endpoint             | owned 與 forwarded 語意分離，不可互換      | dev-pack §3.19 item 3; service contracts §3.7 |
| N-4 | 直接 update `dispatch_trace_log`                            | dispatch trace 是 append-only 後端事件 log | dev-pack §3.19 item 4                         |
| N-5 | 以 DELETE 操作取代停用 / terminated / closed lifecycle      | lifecycle 終止必須走 command endpoint      | dev-pack §3.19 item 5                         |
| N-6 | 讓同一前端 call 同時處理 owned 與 forwarded 的相反語意      | owned/forwarded 路由需明確分開             | conventions §5.5                              |
| N-7 | 在未帶 `Idempotency-Key` 的狀況下重試 POST command endpoint | 重試必須帶 key 以維持冪等語意              | dev-pack §3.2.6                               |

---

## 3. Domain Authority 面向

### Allowed（允許）

- 讀取後端回傳的 domain entity（tenants、orders、drivers、complaints、invoices 等）並顯示。
- 透過後端提供的 command API 進行 CRUD 操作（例如建立乘客、更新地址、取消訂單）。
- 在前端進行 UI 層的表單驗證（必填欄位、格式檢查），但不作為業務規則的最終裁決依據。
- 展示後端下發的 eligibility flag、feature flag 狀態，並據以顯示/隱藏 UI 功能。

### Forbidden（禁止）

| #   | 禁止事項                                                                       | 原因                                                                          | 引用                                          |
| --- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------- |
| D-1 | 在前端評估 dispatchability（例如自行判斷司機是否可派單）                       | 派單資格由後端 regulatory eligibility 服務決定                                | service contracts §3.3, §3.6                  |
| D-2 | 本地計算 billing 金額、費率分攤、或 invoice 欄位                               | billing 真值和計算在後端 billing/settlement 服務                              | service contracts §3.11                       |
| D-3 | 前端直接寫入資料庫或呼叫任何非 API 的 data channel                             | 所有寫入必須透過後端 API endpoint                                             | service contracts §7.1                        |
| D-4 | 把 forwarded 訂單狀態強制轉換或映射成 owned 訂單狀態                           | forwarded 訂單真值在外部平台；本系統只做 mirror                               | service contracts §3.7                        |
| D-5 | 在前端維護 driver shift / earnings 的本地計算模型                              | driver earnings 是後端 read model；前端只顯示                                 | service contracts §3.8                        |
| D-6 | 讓 `public_info_version` 在前端被原地覆寫或 merge                              | 版本化 public info 是後端 immutable publish 流程                              | dev-pack §3.19 item 6; service contracts §3.3 |
| D-7 | 以前端 business rule 決定是否允許某個 API call（例如前端自行 gating 訂單取消） | 後端 command endpoint 本身執行業務規則並回傳錯誤；前端僅需處理 error envelope | service contracts §§3.5–3.6                   |

---

## 4. Webhook / Billing / Audit 面向

### Allowed（允許）

- 在 UI 顯示 webhook endpoint 的設定狀態（已設定的 URL、事件類型、狀態）。
- 透過 API 更新 webhook endpoint metadata（`update_webhook_endpoint` command）。
- 顯示 webhook delivery log（只讀）。
- 在 UI 顯示 billing profile、invoice、driver statement 等資訊（只讀）。
- 更新 billing profile（透過 `update_billing_profile` command endpoint）。
- 顯示 audit log 列表（只讀）。
- 在 webhook 收到時，使用後端提供的 `X-Signature` header 進行 HMAC 驗簽（**由後端主導簽名規格**）。

### Forbidden（禁止）

| #    | 禁止事項                                                             | 原因                                                            | 引用                                      |
| ---- | -------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------- |
| WH-1 | 在前端儲存、快取、或 log webhook 簽名密鑰（secret）                  | webhook secret 只能在後端存放，前端僅做驗簽消費                 | dev-pack §3.15; service contracts §3.13   |
| WH-2 | 前端自行 proxy webhook 給第三方                                      | webhook delivery 和 retry 由後端統一控管                        | service contracts §3.13                   |
| WH-3 | 繞過後端 retry policy 自行重送 webhook 事件                          | retry policy 在後端；違反會造成重複業務事件                     | service contracts §3.13; conventions §5.5 |
| WH-4 | 在前端生成或偽造 webhook payload                                     | webhook 事件只能由後端 domain event 觸發                        | service contracts §3.13                   |
| BI-1 | 前端自行計算 driver 分潤、租戶手續費、或 invoice 金額                | billing/settlement 計算真值在後端；所有金額以後端 response 為準 | service contracts §3.11                   |
| BI-2 | 前端修改 invoice 狀態或 driver statement 欄位（非透過 API）          | billing entity 的 lifecycle 由後端 command 控制                 | service contracts §3.11                   |
| AU-1 | 前端寫入 audit log 或模擬 audit 事件                                 | audit log 是後端 append-only，只有後端 domain service 可寫入    | service contracts §3.13; conventions §5.4 |
| AU-2 | 前端刪除或修改已送出的 audit 記錄                                    | audit append-only 規則，不可更新或刪除                          | service contracts §3.13                   |
| AU-3 | 前端依賴本地 audit log 做業務判斷（例如用 audit event 判斷訂單狀態） | audit 是觀察面，不是控制面；業務狀態從對應 domain API 取得      | service contracts §§3.5, 3.13             |

---

## 5. Consumer Obligations（前端最低履約義務）

前端 repo 必須始終滿足下列基準：

| 項目                     | 說明                                                                                                                  | 引用                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Auth context**         | 目前 tenant portal 走 application-auth-first / bootstrap-header 模式：request 由 shared `@drts/api-client` 帶 caller-type headers（tenant actor / realm / tenant context），不得在 repo B 自行建立第二套 backend authority。若未來切到 Bearer / OIDC，必須連同本文件一起更新。 | `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`; `packages/api-client/src/index.ts`; `RGX-010` |
| **X-Request-Id**         | 每個 request 帶唯一 request id（用於追蹤）                                                                            | dev-pack §3.2.2                    |
| **Idempotency-Key**      | 所有 POST command 帶 key                                                                                              | dev-pack §3.2.2, §3.2.6            |
| **snake_case wire**      | 所有送出的 JSON body 和收到的 JSON response 以 `snake_case` 為準                                                      | dev-pack §3.18; conventions §5.4.2 |
| **Envelope handling**    | page code 不得各自發明另一套 unwrap 規則；success / list contract handling 應集中在 shared client，而不是在 repo B 內分散複製與漂移。 | dev-pack §§3.2.3–3.2.5; `RGX-010`  |
| **Runtime normalization** | JSON wire 仍以 `snake_case` 為準，但前端 runtime object 可由 shared `@drts/api-client` 集中轉成 `camelCase`；page code 不得各自再做私有 fallback mapper。 | dev-pack §3.18; `packages/api-client/src/index.ts`; `RGX-010` |
| **Error envelope**       | 失敗回傳使用 `error.code` / `error.message` / `error.retryable` 處理；不得靜默吞掉錯誤或假設 HTTP status 就能判斷原因 | dev-pack §3.2.4                    |
| **Enum passthrough**     | 收到的 enum 值不做 display-text transform 再送回後端；只送 canonical snake_case value                                 | dev-pack §3.18                     |
| **Auth scope**           | 前端 request 必須攜帶對應 realm/scope；後端 RBAC 為最終守門人                                                         | service contracts §3.1; W7-001B    |
| **Signed download**      | 下載 artifact/invoice 必須使用後端下發的短效 signed URL；不可長期快取或 bypass                                        | dev-pack §3.16; conventions §5.5   |

`2026-04-22` local annex audit conclusion:

- local workspace checkout no longer shows direct tenant-domain data authority
- clean `origin/main` clone still violates this boundary and remains
  Supabase-first
- residual local bootstrap session / role derivation drift still exists even in
  the cutover-in-progress workspace checkout
- `2026-04-23` addendum: tenant cutover merged through
  `ajoe734/tenant-commute-hub#1`, the companion backend compatibility patch
  merged through `ajoe734/drts-fleet-platform#1`, and targeted local live smoke
  passed through the landing branch plus local `drts-api` before merge
- remote baseline truth for the cutover is now established, although the
  backend merge happened with explicit owner risk acceptance because GitHub CI
  still showed unrelated clean-branch debt
- this boundary doc remains normative, while `RGX-010` records the observed
  gap between local branch state and clean remote-main state

---

## 6. 快速參考：五面向禁止事項彙總

```
Schema:
  S-1  送 camelCase body
  S-2  送顯示文案作 enum value
  S-3  前端自定 domain enum
  S-4  自行 unwrap list envelope
  S-5  前端產生派生 schema

API Naming:
  N-1  直接 PATCH status 欄位
  N-2  用 query param 表達命令
  N-3  forwarded 單用 owned endpoint
  N-4  直接 update dispatch_trace_log
  N-5  DELETE 取代 lifecycle command
  N-6  單一 call 混用 owned/forwarded 語意
  N-7  重試 POST 不帶 Idempotency-Key

Domain Authority:
  D-1  前端評估 dispatchability
  D-2  本地計算 billing 金額
  D-3  前端直接寫 DB
  D-4  forwarded 狀態 remap 成 owned
  D-5  前端維護 earnings 計算模型
  D-6  覆寫 public_info_version
  D-7  前端 gating 業務命令

Webhook / Billing / Audit:
  WH-1  儲存 webhook secret
  WH-2  前端 proxy webhook
  WH-3  自行重送 webhook
  WH-4  偽造 webhook payload
  BI-1  前端計算 billing 金額
  BI-2  直接修改 invoice/statement
  AU-1  前端寫入 audit log
  AU-2  刪除/修改 audit 記錄
  AU-3  以 audit event 做業務判斷
```

---

## 7. Governance

- 本文件由 `drts-fleet-platform` 的 Claude（governance/architecture 角色）維護。
- Reviewer: Codex（contracts/schema 角色）。
- 更新觸發條件：新增跨 repo API 面向、調整 domain authority 分配、接入新外部整合方。
- 更新流程：對本文件提 diff → 引用 L1/L2 文件或新 consensus packet → 由 supervisor 路由進入 discussion → 人工確認後方可更新。
- 本文件不覆蓋也不取代 `docs/02-architecture/authority/rgp-002-authority-map.md`（Producer/Consumer 矩陣詳表）。兩者互相引用。
