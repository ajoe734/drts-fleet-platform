# Phase 1 系統設計裁決與開發執行指引

**文件目的**：回覆系統開發部門提出的 `SD-001` ~ `SD-004` 系統設計問題，並提供可直接執行的 repo / backlog / API / CI/CD 調整方向。  
**適用範圍**：計程車自駕 Phase 1。  
**主要 repos**：

- `ajoe734/drts-fleet-platform`
- `ajoe734/tenant-commute-hub`

**日期**：2026-04-22  
**文件狀態**：已於 `2026-04-22` 經 human review 納入 implementation blueprint；正式可引用版本見 `docs/01-decisions/SD-DP-20260422-001` ~ `003`。  
**輸入來源**：`system-design-input-requests-20260422.md`

補充：若討論的是 `credit_card_airport_transfer` 的合作銀行多入口、
partner ingress、或卡別資格驗證，請一併參考
`docs/02-architecture/phase1-partner-channel-bank-entry-addendum-20260425.md`。

---

## 0. Executive Summary

本文件對四個系統設計問題給出正式裁決：

| ID     | 問題                                         | 裁決                                                                                                                                                                                                                           |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SD-001 | Phase 1 是否保留第一方 Passenger App / Web？ | **選 B**：Phase 1 移除第一方 Passenger App / Web；需求入口改為第三方叫車平台與 partner / tenant channel。第一方 passenger surface 可註記為 future option，但不列入 Phase 1 completion bar。                                    |
| SD-002 | 沒有第一方 passenger UI 時，收據如何交付？   | Phase 1 不建立 passenger receipt UI。第三方平台單由第三方平台交付；partner / tenant 單由 partner / tenant channel 交付；我方保留 canonical finance / settlement / audit records，提供 admin / tenant / backoffice 查詢與下載。 |
| SD-003 | Cloud IAP / OIDC production cutover 怎麼切？ | **選 C**：採 staged topology。先讓 API 具備 OIDC capability，再分階段切 admin / ops / roc control-plane API 與內部 web；Tenant Portal、Driver App、external adapters 不預設走 IAP。                                            |
| SD-004 | 新產品決策和舊 PRD / SA 衝突時誰優先？       | 採 **accepted decision packet temporarily supersedes old L1 wording**。執行中不允許工程自行重寫 L1 canonical files；先用 accepted decision packet 暫時覆蓋，下一輪 controlled design revision 再正式更新 L1。                  |

本文件同時確認 repo 邊界：

- `drts-fleet-platform` 是 **canonical backend / BFF / contracts / SDK / auth / audit / settlement / adapter authority**。
- `tenant-commute-hub` 是 **Tenant Portal frontend repo**，正式資料應改走 `drts-fleet-platform` 的 `/api/tenant/*`。
- `tenant-commute-hub` 不得再擴張 production-grade backend authority。
- Driver App Phase 1 必須修正為 **多平台司機工作台**，不是自家中央派遣執行器。

---

## 1. Product Truth Baseline

### 1.1 Phase 1 正式需求入口

Phase 1 的乘車需求入口不再包含一般消費者用的第一方 Passenger App / Web。正式入口為：

1. **第三方叫車平台導單**
   - 外部平台保留自己的乘客流程、派單邏輯、路線規劃、價格顯示、付款與乘客通知。
   - 我方系統只做 adapter / forwarder / task mirror / status sync / earnings aggregation。
   - 不重寫第三方平台派單規則。
   - 不重算第三方平台已規劃的 route intent。

2. **Partner / Tenant Channel**
   - 包含大型企業派車、信用卡機場接送、合作租戶預約入口。
   - `tenant-commute-hub` 可作為租戶或合作夥伴的 Web Portal 前端。
   - 正式資料來源必須是 `drts-fleet-platform` 的 `/api/tenant/*`。

3. **Operator / Backoffice Manual Entry**
   - 保留營運人員、客服、話務、派遣人員從後台建立或修正任務的能力。
   - 這不是 passenger self-service surface。

### 1.2 Phase 1 明確不做

Phase 1 不做：

- 第一方一般乘客 App。
- 第一方一般乘客 Web 叫車頁。
- 第一方乘客登入中心。
- 第一方乘客收據中心。
- 由 `tenant-commute-hub` 自行發展成 passenger product。
- 由 Driver App 重新決定外部平台單的派單 / route / price / passenger notification。

---

## 2. SD-001 Passenger Entry Topology

### 2.1 Question

是否應將 Phase 1 canonical product truth 中的第一方 `Passenger App / Web` 移出 scope，並改成第三方叫車平台 / partner channel 作為需求入口？

### 2.2 Decision

**選 B：Remove first-party passenger surface from Phase 1 scope and declare third-party entry / partner-channel entry as the intended topology.**

補充：

- 第一方 Passenger App / Web 可註記為 future option。
- 但它不屬於 Phase 1 completion bar。
- 開發團隊不得因舊 PRD / SA 仍出現 passenger wording，就繼續 materialize passenger surface。

### 2.3 Rationale

目前商業模式不是賣 passenger app，也不是建立新的消費者叫車入口。Phase 1 的核心是：

- 取得與整合訂單來源。
- 讓合格司機用同一個 Driver App 接不同平台任務。
- 對外部平台單保留平台原本派單規則。
- 對企業 / 信用卡 / 租戶單提供 B2B / B2B2C 入口與履約管理。

因此，若繼續把第一方 Passenger App / Web 放在 Phase 1 completion bar，會造成工程團隊往錯的方向做。

### 2.4 Implementation Implications

#### `drts-fleet-platform`

應新增 / 強化：

- `forwarder` domain
- `platform_adapter` domain
- `platform_task_mirror` domain
- `platform_presence` domain
- `platform_earnings` domain
- partner / tenant booking API
- operator-created booking API
- source-aware trip state machine

應避免：

- 新增 consumer passenger app API 作為 Phase 1 P0。
- 新增 passenger notification center 作為 Phase 1 P0。
- 將 forwarded order 轉成 owned dispatch order 後重派。

#### `tenant-commute-hub`

應定位為：

- Tenant Portal frontend
- partner / tenant booking frontend
- `POST /api/tenant/bookings` 的前端 consumer
- `GET /api/tenant/bookings` 的前端 consumer

不得定位為：

- 一般乘客 Web
- 另一套 consumer booking product
- 另一套 booking authority

### 2.5 Acceptance Criteria

開發完成後應符合：

- `tenant-commute-hub` 不提供一般消費者註冊 / 登入 / 自助叫車流程。
- 任務來源必須帶 `sourceType` / `sourcePlatform` / `orderAuthority`。
- 第三方平台單標記為 `forwarded` 或等價欄位。
- `forwarded` 單不進入 owned dispatch decision engine。
- Driver App 任務卡可顯示來源平台與外部平台規則摘要。

---

## 3. SD-002 Receipt Delivery Without First-Party Passenger UI

### 3.1 Question

若 Phase 1 不提供第一方 Passenger UI，收據要怎麼交付？

### 3.2 Decision

Phase 1 不建立第一方 passenger receipt UI。收據交付責任依訂單來源與付款責任方決定。

### 3.3 Receipt Delivery Matrix

| Order Source                 | Passenger-facing Receipt Owner      | 我方系統責任                                                                                    |
| ---------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| 第三方叫車平台               | 第三方平台                          | 保存 external receipt ref、fare summary、settlement、driver earnings、audit，不主動寄乘客收據。 |
| 信用卡機場接送               | 信用卡 / 服務平台 / partner channel | 提供 partner statement、tenant invoice、trip statement、settlement API / report。               |
| 大型企業派車                 | 企業租戶 / partner channel          | 提供 tenant invoice、trip statement、cost center report、download / webhook。                   |
| Operator-created owned order | Backoffice / tenant portal          | 提供 admin / tenant / operator 下載與查詢，不做 passenger receipt center。                      |

### 3.4 Explicitly Out of Scope in Phase 1

Phase 1 不做：

- 乘客登入查收據。
- 乘客 App 收據頁。
- 乘客 Web download link。
- 未經設計批准的 email receipt。
- 未經設計批准的 SMS receipt。
- Driver App 產生乘客收據。
- 對外部平台乘客重寄收據。

### 3.5 Canonical Finance Record

即使不做 passenger receipt UI，我方仍必須有 canonical finance / audit records：

- trip id
- order source
- external order id
- payer type
- partner id / tenant id
- driver id
- vehicle id
- gross fare
- platform fee
- driver earning
- subsidy / adjustment
- tax / invoice reference
- external receipt reference
- settlement batch id
- audit event ids

### 3.6 Implementation Tasks

#### Backend

新增或確認：

- `GET /api/tenant/invoices`
- `POST /api/tenant/billing/profile`
- `GET /api/tenant/statements`
- `GET /api/admin/settlements`
- `GET /api/driver/earnings`
- `GET /api/driver/earnings?platform=...`
- `GET /api/admin/orders/{id}/financial-record`
- `POST /api/admin/settlement-batches`

#### Tenant Portal

顯示：

- tenant invoice list
- cost center summary
- trip statement download
- statement export
- webhook delivery status

不顯示：

- passenger receipt login
- passenger receipt download center

#### Driver App

顯示：

- platform-by-platform earnings
- gross / fee / subsidy / net
- statement period
- source platform
- payout status

---

## 4. SD-003 Cloud IAP / OIDC Cutover Topology

### 4.1 Question

`GAP-P2S3-001` production identity boundary 要怎麼切？

選項：

- A：`drts-api` first only
- B：`drts-api` plus web surfaces same wave
- C：another staged topology

### 4.2 Decision

**選 C：採 staged topology。**

不採「整個 `drts-api` + 所有 web surfaces 同波切換」。

### 4.3 Rationale

`drts-api` 不只有內部 admin caller。它同時服務：

- Platform Admin Web
- Ops / ROC Web
- Tenant Portal
- Driver App
- external platform adapters
- webhook callbacks
- partner integrations
- CI / smoke tests

不同 caller 的 identity boundary 不同。如果一次把整個 API 放進單一 IAP boundary，會打壞 tenant / driver / adapter / webhook flow。

### 4.4 Staged Cutover Plan

#### Stage 0：API code readiness only

先讓 API 具備 OIDC / Bearer verification capability，但不改 production ingress。

必須完成：

- OIDC issuer validation
- audience validation
- realm separation
- admin audience
- ops / roc audience
- tenant audience
- driver audience
- partner adapter credentials
- webhook signature validation
- local dev bypass only in non-production
- smoke tests per caller type

#### Stage 1：Internal control-plane API first

先切高敏感 control-plane API：

- `/api/admin/*`
- `/api/ops/*`
- `/api/roc/*`
- pricing / split
- payments
- admin audit
- feature flags
- switchboard / external API config

這些 API 的 caller：

- `platform-admin-web`
- `ops-console-web`
- controlled internal tools
- CI smoke test service accounts

#### Stage 2：Internal web surfaces

第二波切：

- `platform-admin-web`
- `ops-console-web`

這些 web surfaces 可以放在：

- External Application Load Balancer
- Cloud IAP
- Cloud Run serverless NEG
- application-level RBAC / audit

#### Stage 3：Tenant Portal remains application-auth-first

`tenant-commute-hub` / Tenant Portal 不預設走 Cloud IAP。

原因：

- 租戶使用者不一定是內部 Google identity。
- Tenant Portal 是 B2B portal。
- 它需要 tenant-level auth / SSO / RBAC。
- 它吃 `/api/tenant/*`，不是內部 admin console。

Tenant Portal production identity boundary：

- app-level tenant auth
- tenant-scoped RBAC
- audit trail
- optional enterprise SSO
- not mandatory Cloud IAP

#### Stage 4：Driver App and external adapters never depend on IAP

Driver App 不走 IAP，改用：

- mobile auth
- OTP / SSO
- device binding
- refresh tokens
- device push token
- driver profile / entitlement
- driver platform presence

External adapters / webhooks 不走 IAP，改用：

- partner OAuth
- API key
- mTLS where applicable
- webhook signature
- IP allowlist
- replay protection
- idempotency key
- adapter-level audit

### 4.5 Caller Type Matrix

| Caller             | Auth Boundary                               | API Prefix                          | IAP?          |
| ------------------ | ------------------------------------------- | ----------------------------------- | ------------- |
| Platform Admin Web | admin OIDC + RBAC + IAP                     | `/api/admin/*`                      | Yes, staged   |
| Ops / ROC Web      | ops / roc OIDC + RBAC + IAP                 | `/api/ops/*`, `/api/roc/*`          | Yes, staged   |
| Tenant Portal      | tenant app auth / optional enterprise SSO   | `/api/tenant/*`                     | No by default |
| Driver App         | mobile auth + device binding                | `/api/driver/*`                     | No            |
| Partner Adapter    | partner credentials / mTLS / signatures     | `/api/partner/*` or adapter ingress | No            |
| Webhook Callback   | signature + idempotency + replay protection | `/api/webhooks/*`                   | No            |
| CI / Smoke         | service account / WIF                       | selected internal endpoints         | Controlled    |

### 4.6 Implementation Tasks

#### Backend

- Add realm-aware auth guard.
- Separate admin / tenant / driver / partner token verification.
- Add caller-type smoke tests.
- Add request audit with `callerType`.
- Reject ambiguous bearer tokens in production.
- Make local bypass impossible in production.

#### DevOps

- Configure GCP Workload Identity Federation for GitHub Actions.
- Do not use long-lived service account JSON keys.
- Configure LB + IAP only for admin / ops / roc surfaces.
- Maintain separate ingress policy for tenant / driver / adapter APIs.
- Add canary smoke tests per caller type.

#### Frontend

- `platform-admin-web` and `ops-console-web`: support IAP-protected deployment.
- `tenant-commute-hub`: remain tenant-app-auth-first.
- Driver App: do not add IAP dependency.

### 4.7 Acceptance Criteria

- Admin API can be protected without breaking Tenant Portal.
- Ops API can be protected without breaking Driver App.
- Webhook callbacks do not require human interactive login.
- Driver App can authenticate on mobile network without IAP.
- CI/CD deploys via WIF.
- Smoke tests include admin, ops, tenant, driver, partner, webhook callers.

---

## 5. SD-004 Design-Truth Supersession Rule During Execution

### 5.1 Question

當新產品決策與舊 PRD / SA wording 衝突時，什麼文件可以暫時覆蓋舊 L1 canonical wording？

### 5.2 Decision

採用：

**Accepted decision packet temporarily supersedes old L1 wording.**

### 5.3 Rule

當產品真值已經由 human / system-design function 決定，但 L1 canonical docs 尚未更新時：

1. 不允許工程師自行直接改寫 L1 canonical design files。
2. 不允許工程實作反過來定義產品語意。
3. 先建立 accepted decision packet。
4. decision packet 在指定 scope 內暫時 supersede 舊 L1 wording。
5. execution docs / backlog / code 可依 decision packet 更新。
6. 下一輪 controlled design revision 再正式更新 L1 PRD / SA / API / architecture docs。

### 5.4 Allowed Superseding Artifacts

只有三種 artifact 可以 supersede：

#### A. Accepted System Design Decision Packet

適用於本次情境，例如：

- Phase 1 移除 first-party Passenger App / Web。
- Tenant Portal 收斂為 frontend-only consumer。
- Driver App 改成多平台司機工作台。
- 第三方平台單只做 mirror / sync / earnings，不重派單。

#### B. Dedicated System Design Spec

適用於大型結構調整，例如：

- identity topology
- multi-repo collaboration loop
- deployment topology
- adapter architecture
- driver multi-platform runtime

#### C. Direct L1 Canonical Edit

只在產品負責人 / 系統設計負責人明確批准正式改版時使用。

### 5.5 Decision Packet Required Fields

每份 decision packet 至少包含：

```yaml
decision_id:
title:
owner:
date:
status:
affected_docs:
old_wording_or_conflicting_anchor:
superseding_decision:
scope:
out_of_scope:
implementation_implications:
migration_tasks:
completion_bar:
rollback_or_revisit_conditions:
approval:
```

### 5.6 Required Decision Packet Files

請在 `drts-fleet-platform` 建立：

```text
docs/01-decisions/
  SD-DP-20260422-001-phase1-entry-and-receipt-topology.md
  SD-DP-20260422-002-identity-cutover-topology.md
  SD-DP-20260422-003-design-truth-supersession-rule.md
```

其中：

- `SD-DP-20260422-001` 覆蓋 SD-001 + SD-002。
- `SD-DP-20260422-002` 覆蓋 SD-003。
- `SD-DP-20260422-003` 覆蓋 SD-004。

### 5.7 L1 Files Handling

現在不要直接改：

- canonical PRD
- canonical SA
- canonical architecture map
- canonical API list

先改：

- execution backlog
- runbooks
- implementation tickets
- `.ai-loop/` frontend specs
- repo governance docs
- decision packets

下一輪 controlled design sync 再正式改 L1。

---

## 6. Repo-Level Directives

## 6.1 `drts-fleet-platform`

### 正式定位

`drts-fleet-platform` 是：

- canonical backend
- canonical BFF
- canonical API authority
- contracts / SDK authority
- auth / RBAC authority
- audit authority
- billing / settlement authority
- adapter / forwarder authority
- Platform Admin mainline
- Ops / ROC mainline
- Driver App mainline

### P0 修改方向

1. 建立上述 decision packets。
2. 更新 execution backlog。
3. 建立或強化 `/api/tenant/*`。
4. 建立或強化 `/api/admin/*`。
5. 建立或強化 `/api/driver/*`。
6. 建立 `platform_presence` domain。
7. 建立 `platform_task_mirror` domain。
8. 建立 `platform_earnings` domain。
9. Driver App backlog 改成多平台司機工作台。
10. Identity rollout 改為 staged topology。

### P0 不得繼續做

- 不得把 first-party passenger app 當 Phase 1 P0。
- 不得新增 passenger receipt center。
- 不得讓 `tenant-commute-hub` 繼續成為 production backend authority。
- 不得將所有 API caller 假設為同一種 IAP bearer caller。

---

## 6.2 `tenant-commute-hub`

### 正式定位

`tenant-commute-hub` 是：

- Tenant Portal frontend repo
- Lovable UI production / iteration repo
- `/api/tenant/*` consumer
- `.ai-loop/` frontend spec / feedback carrier

### P0 修改方向

1. 停止擴張 Supabase production authority。
2. 將 tenant data CRUD 改成呼叫 `drts-fleet-platform` 的 `/api/tenant/*`。
3. 保留 UI / page / component / route / state。
4. 將 Supabase tables / functions 降級為 prototype / mock / transition only。
5. 建立 `.ai-loop/` 開發閉環檔案。

### 必備 `.ai-loop/` 檔案

```text
tenant-commute-hub/
  .ai-loop/
    FRONTEND_CHANGE_SPEC.md
    FRONTEND_CHANGE_SPEC.json
    LOVABLE_CHANGE_FEEDBACK.md
    API_GAP_REQUESTS.json
    UI_DECISIONS.md
    QA_STATUS.md
    BACKEND_DELIVERY_NOTE.md
    CONTRACT_VERSION.lock
```

### Lovable / VS Code 閉環

正式閉環如下：

```text
VS Code vibe coding LLM
  -> writes FRONTEND_CHANGE_SPEC into tenant-commute-hub
Lovable
  -> reads spec from GitHub
  -> modifies UI / pages / components
  -> writes LOVABLE_CHANGE_FEEDBACK + API_GAP_REQUESTS
VS Code vibe coding LLM
  -> reads feedback
  -> implements backend API / contracts / SDK in drts-fleet-platform
drts-fleet-platform
  -> writes BACKEND_DELIVERY_NOTE / CONTRACT_VERSION
Lovable
  -> consumes delivery note and continues next frontend iteration
```

---

## 7. Driver App Product Correction

### 7.1 Correct Phase 1 Position

Driver App Phase 1 是：

**多平台司機工作台**

不是：

**自家中央派遣執行器**

### 7.2 Required Capabilities

Driver App 必須支援：

- 顯示不同叫車平台任務。
- 任務卡顯示 source platform。
- 司機對每個平台 individually 上線 / 下線。
- 顯示平台帳號綁定狀態。
- 顯示平台資格 / 車種限制。
- 顯示外部平台原始 route intent。
- 顯示 route locked / fixed price / partner rule。
- 對 forwarded 單只做 accept / reject / status sync。
- 不重寫外部平台派單規則。
- 不重算外部平台路線。
- 收益頁支援平台別收益與總收益。
- driver statement 可依平台篩選。

### 7.3 Driver APIs Needed

```text
GET  /api/driver/platforms
POST /api/driver/platforms/{platformId}/online
POST /api/driver/platforms/{platformId}/offline
GET  /api/driver/tasks?sourcePlatform=&status=
GET  /api/driver/tasks/{id}
POST /api/driver/tasks/{id}/accept
POST /api/driver/tasks/{id}/reject
POST /api/driver/tasks/{id}/status
GET  /api/driver/earnings?groupBy=platform
GET  /api/driver/statements?platform=&from=&to=
```

### 7.4 Task Payload Requirements

Driver task payload 至少包含：

```json
{
  "taskId": "string",
  "sourceType": "owned|forwarded|partner",
  "sourcePlatform": "string",
  "externalOrderId": "string|null",
  "dispatchAuthority": "internal|external",
  "routeAuthority": "internal|external",
  "fareAuthority": "internal|external|partner_fixed",
  "routeLocked": true,
  "fixedPrice": true,
  "pickup": {},
  "dropoff": {},
  "waypoints": [],
  "platformRules": [],
  "acceptedActions": [],
  "statusMapping": {}
}
```

---

## 8. EX Items Handling

開發部門提出的 EX 類項目不需要 system-design semantic decision，但需要 execution input。

### EX-001 External adapter real integration

需要：

- partner API contract
- credentials
- sandbox
- test account
- webhook signature rules
- settlement sample files
- evidence log

這是 partner enablement，不是產品設計問題。

### EX-002 `tenant-commute-hub` authority annex audit

方向已定：

- `drts-fleet-platform` = canonical backend
- `tenant-commute-hub` = frontend repo
- production authority must be migrated back to core

需要補：

- code-level migration tickets
- Supabase authority retirement plan
- API replacement matrix
- mock / preview fallback plan

### EX-003 current-work / sprint wording drift

這是 execution docs sync，不需要改產品語意。

---

## 9. Immediate Engineering Tasks

### 9.1 Architecture / Docs

| Priority | Task                                                                             | Repo                  |
| -------- | -------------------------------------------------------------------------------- | --------------------- |
| P0       | 建立 `docs/01-decisions/SD-DP-20260422-001-phase1-entry-and-receipt-topology.md` | `drts-fleet-platform` |
| P0       | 建立 `docs/01-decisions/SD-DP-20260422-002-identity-cutover-topology.md`         | `drts-fleet-platform` |
| P0       | 建立 `docs/01-decisions/SD-DP-20260422-003-design-truth-supersession-rule.md`    | `drts-fleet-platform` |
| P0       | 更新 execution backlog，標註 Passenger App / Web 不列入 Phase 1                  | `drts-fleet-platform` |
| P0       | 更新 Tenant Portal backlog，標註 frontend-only / `/api/tenant/*` consumer        | both                  |
| P0       | 更新 Driver App backlog，標註 multi-platform driver workspace                    | `drts-fleet-platform` |
| P0       | 更新 identity rollout checklist，採 staged topology                              | `drts-fleet-platform` |

### 9.2 Backend

| Priority | Task                                               |
| -------- | -------------------------------------------------- |
| P0       | 補齊 `/api/tenant/*` 覆蓋 tenant portal pages      |
| P0       | 補齊 `/api/driver/platforms` / platform presence   |
| P0       | 補齊 forwarded task mirror / status sync           |
| P0       | 補齊 platform earnings aggregation                 |
| P0       | 補 caller-type auth tests                          |
| P1       | 補 partner settlement / external receipt reference |
| P1       | 補 report / invoice export                         |

### 9.3 Frontend - `tenant-commute-hub`

| Priority | Task                                                                              |
| -------- | --------------------------------------------------------------------------------- |
| P0       | 建立 `.ai-loop/` 檔案架構                                                         |
| P0       | 將 booking list / new booking 改接 `/api/tenant/bookings`                         |
| P0       | 將 passengers / addresses 改接 `/api/tenant/passengers` / `/api/tenant/addresses` |
| P0       | 將 billing / invoices 改接 `/api/tenant/invoices` / `/api/tenant/billing/profile` |
| P0       | 將 audit 改接 `/api/tenant/audit`                                                 |
| P0       | 標註 Supabase authority 為 prototype / transition only                            |
| P1       | 加 contract compatibility check                                                   |
| P1       | 加 e2e against staging BFF                                                        |

### 9.4 Mobile - Driver App

| Priority | Task                                                                |
| -------- | ------------------------------------------------------------------- |
| P0       | Jobs Inbox 加 source platform badge                                 |
| P0       | Platform Presence Center：平台別上線 / 下線                         |
| P0       | Task Detail 顯示 external route intent / route locked / fixed price |
| P0       | Earnings 改為 platform-by-platform + total                          |
| P0       | Forwarded task 只做 sync，不進 internal dispatch UI                 |
| P1       | 加 account binding / token expiry / re-auth UI                      |
| P1       | 加 platform-specific error / rejection reason                       |

### 9.5 DevOps / Security

| Priority | Task                                                    |
| -------- | ------------------------------------------------------- |
| P0       | GitHub Actions -> GCP 使用 Workload Identity Federation |
| P0       | 禁止長期 service account key JSON                       |
| P0       | Admin / Ops / ROC web 建 IAP-protected staging path     |
| P0       | Tenant / Driver / Webhook API 不放入 IAP dependency     |
| P0       | Smoke tests 分 caller type                              |
| P1       | preview env 加 API contract compatibility check         |
| P1       | staged rollout runbook                                  |

---

## 10. Completion Bar

此 decision packet 被落實後，Phase 1 應達到：

1. 第一方 Passenger App / Web 不再被列為 Phase 1 in-scope surface。
2. `tenant-commute-hub` 是 tenant frontend，不是 second backend authority。
3. 所有 production tenant data 走 `drts-fleet-platform` `/api/tenant/*`。
4. Driver App 是多平台司機工作台。
5. 第三方平台單不被重派單、不被重算路線。
6. 收據交付責任依 source platform / partner / tenant channel 決定。
7. 我方保留 canonical financial / settlement / audit records。
8. IAP / OIDC rollout 採 staged topology。
9. Decision packet 被 execution backlog 引用。
10. L1 canonical files 在下一輪 controlled design revision 中更新，而不是由工程 ad hoc 修改。

---

## 11. Open Items

仍需外部輸入的項目：

| Item                         | Needed Input                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Third-party platform adapter | partner API contract, sandbox credentials, webhook signatures, settlement samples |
| Credit-card airport transfer | partner order payload, receipt ownership, settlement file format                  |
| Enterprise dispatch          | tenant booking SLA, cost center rules, invoice grouping                           |
| Driver platform presence     | per-platform login / online API support                                           |
| Production IAP setup         | GCP project / domain / OAuth client / IAM group decisions                         |

---

## 12. Final Instruction To Development Team

請依本文件更新開發方向：

- 不再以第一方 Passenger App / Web 作為 Phase 1 completion bar。
- 不新增 passenger receipt UI。
- `tenant-commute-hub` 收斂成 Tenant Portal frontend repo。
- `drts-fleet-platform` 維持 canonical backend / BFF / contracts authority。
- Driver App 立即改為多平台司機工作台。
- Identity rollout 採 staged topology，不要把所有 caller 放進同一個 IAP boundary。
- 新決策與舊 PRD / SA 衝突時，以 accepted decision packet 暫時 supersede，下一輪再統一更新 L1 canonical docs。
