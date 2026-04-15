# Phase 1 Next-Wave Planning Brief

# Supervisor Planning Mode Entry Material

**生成日期：** 2026-04-14  
**來源依據：** `repo_gap_reassessment_for_dev_team_v3.md`（外部 gap 分析）+ repo 現況掃描  
**目的：** 作為進入 supervisor planning mode 的輸入材料，定義下一階段工作邊界與任務切分

---

## 1. 當前執行狀態快照

### 1.1 已完成工作（全部 `done`）

| Task ID | 說明                                                     |
| ------- | -------------------------------------------------------- |
| W1-004A | Foundation audit-notification slice                      |
| W2-002A | Owned order-dispatch-driver execution loop               |
| W3-001A | Callcenter and CTI correlation baseline                  |
| W3-001B | Complaint case lifecycle baseline                        |
| W4-001A | Billing and settlement baseline                          |
| W5-001A | Reporting and filing baseline                            |
| W6-001A | Forwarder mirror and relay baseline                      |
| W7-001A | Persistence and migration alignment                      |
| W7-001B | Auth and RBAC hardening                                  |
| W7-001C | Webhook and artifact runtime hardening                   |
| W7-001D | Wire contract and async job conformance                  |
| W8-001A | Client integration and feature-flag rollout              |
| W8-001B | Backfill, UAT, and rollout packs                         |
| W8-001C | Dispatch and booking target-state completion             |
| W8-001D | Tenant, regulatory, and admin source-of-truth completion |
| W8-001E | Ops and driver domain completion                         |

**結論：** Wave 1–8 全部後端任務已完成。`ai-status.json` 無任何 `in_progress` 或 `blocked` 任務。

---

### 1.2 現有前端 App 狀態（code-level 掃描結果）

| App                       | 現況                                                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `apps/platform-admin-web` | 所有頁面為 placeholder shell，文字直接寫明 "Placeholder tenant inventory", "Placeholder fleet" 等                |
| `apps/ops-console-web`    | dispatch 頁面已接 API（listOrders / listDispatchJobs），但無 assignment actions、ETA、候選選擇、queue 管理       |
| `apps/driver-app`         | jobs.tsx 呼叫 `listDriverTasks()`，無 `sourcePlatform`、無平台 badge、無 platform presence、無 platform earnings |
| `apps/tenant-portal-web`  | 存在 shell，對應關係待確認（與 `tenant-commute-hub` 的邊界未鎖定）                                               |

### 1.3 現有後端模組狀態（已確認存在）

所有 domain 模組均已建立：`foundation`, `audit-notification`, `billing-settlement`, `callcenter`, `complaint`, `driver-settings`, `feature-flags`, `forwarder`, `identity`, `incident`, `maintenance`, `owned-mobility`, `platform-admin`, `product-rule`, `regulatory-registry`, `reporting-filing`, `shift-attendance`, `tenant-partner`

**缺口：**

- `platform_presence` 模組不存在（driver app 多平台上線/下線）
- `platform_earnings` 模組不存在（依平台彙總收益）

---

## 2. Gap 文件核心指令（翻譯為執行語言）

### 2.1 P0 立即修正項

1. **修正 Driver App 產品定義** — 由「單一派遣 runtime」改為「多平台司機工作站」
2. **建立 `platform_presence` domain** — 後端模組 + driver app UI（per-platform online/offline, token expiry, re-auth）
3. **建立 `platform_earnings` domain** — 後端模組 + driver app UI（依平台分類彙總，gross/fee/subsidy/net）
4. **定義 forwarded task display/sync 規格** — driver app 顯示第三方平台任務但不覆寫其派遣規則
5. **Platform Admin Web control plane backlog 正式化** — 從 placeholder 升級為可操作控制面板

### 2.2 P1 重要項

1. `tenant-commute-hub` frontend repo 對齊 core contracts（不自行定義 schema）
2. Ops dispatch board 升級為真正可操作的排班/派單 console
3. Ops/Driver domain UI 端到端完整（incident, maintenance, shift/attendance, earnings, settings 全 API 接通且有 action）
4. Staging pipeline 建立

### 2.3 P2 完善項

1. Tenant Portal 全部頁面 integration 與 UX 收尾
2. Multi-repo governance 文件
3. `tenant-commute-hub` code-level annex（在 repo 內容可讀後補充）

---

## 3. 建議工作包切分（供 supervisor 採納）

### Wave A — 核心 Truth 修正（P0，阻擋後續）

| ID     | 標題                                           | Owner 建議 | 依賴                      | 備注                                                                                               |
| ------ | ---------------------------------------------- | ---------- | ------------------------- | -------------------------------------------------------------------------------------------------- |
| WA-001 | platform_presence backend module               | Codex      | W7-001A, W7-001B          | 新 NestJS module，per-platform online/offline, token expiry，含 migration V00xx                    |
| WA-002 | platform_earnings backend module               | Codex      | W7-001A, W7-001B, W4-001A | 新 NestJS module，依平台彙總 driver 收益 read model                                                |
| WA-003 | Driver App — 重新定位為多平台工作站            | Qwen       | WA-001, WA-002            | 更新 jobs.tsx 加入 sourcePlatform + platform badge，新增 platform-presence page，重構 earnings.tsx |
| WA-004 | Forwarded task mirror semantics in driver app  | Qwen       | WA-003, W6-001A           | 顯示第三方平台任務，route-locked flag，不允許覆寫第三方派遣規則                                    |
| WA-005 | tenant-commute-hub authority boundary document | Claude     | W8-001D                   | 在 core repo 文件化 boundary，確保前端 repo 不自行定義 domain authority                            |

### Wave B — 前端控制面板完整化（P0/P1）

| ID     | 標題                                              | Owner 建議 | 依賴                    |
| ------ | ------------------------------------------------- | ---------- | ----------------------- |
| WB-001 | Platform Admin Web — full control plane           | Codex      | W8-001D, W7-001B        |
| WB-002 | Ops Console — genuine dispatch scheduling console | Qwen       | W8-001C, W7-001B        |
| WB-003 | Ops/Driver domain UI end-to-end completion        | Gemini     | W8-001E, WA-001, WA-002 |

**WB-001 細節（Platform Admin Web 需覆蓋）：**

- tenants：CRUD、tenant status 控制
- users/roles：platform-level user management
- fleet/devices：vehicle & device inventory
- switchboard：external API 管理
- pricing/split：pricing rule + split 配置
- payments/acquiring：收款 overview
- health/quotas：tenant quota + platform health
- audit/flags/notices/maintenance mode：完整 control surface
- feature flags：已有 backend，需補前端操作面

**WB-002 細節（Ops Console dispatch 需覆蓋）：**

- 候選車輛/司機選擇
- ETA 顯示
- assignment 操作（assign/reassign/release）
- queue 檢視（pending / reserved / exception）
- redispatch queue 管理
- exception_hold 處理流程

**WB-003 細節（端到端）：**

- incident：create/update/resolve 操作皆有 UI
- maintenance：work order CRUD
- shift/attendance：shift start/end、attendance record
- driver earnings：statement 完整顯示 + download
- driver settings：帳號、偏好、文件

### Wave C — Driver 多平台完整功能（P0/P1）

| ID     | 標題                               | Owner 建議 | 依賴           |
| ------ | ---------------------------------- | ---------- | -------------- |
| WC-001 | Platform Task Inbox                | Qwen       | WA-003         |
| WC-002 | Platform Presence Center           | Qwen       | WA-001, WA-003 |
| WC-003 | Platform Account Binding + Re-auth | Codex      | WA-001         |
| WC-004 | Platform Earnings Dashboard        | Codex      | WA-002, WA-003 |
| WC-005 | Forwarded task route-aware UI      | Qwen       | WA-004         |

**WC-001 Platform Task Inbox 欄位需求：**

- `sourcePlatform` label + platform badge
- 任務來源類型（platform_dispatch / enterprise_shuttle / airport_pickup / auto_assigned）
- `routeLocked` / `routeProvided` flag 顯示
- `fixedPrice` / `editablePrice` flag 顯示

**WC-002 Platform Presence Center 需求：**

- 各平台帳號狀態（linked / unlinked）
- per-platform online / offline toggle
- token expiry 警示
- re-auth flow
- platform eligibility 顯示

### Wave D — Tenant Portal 全整合（P1/P2）

| ID     | 標題                              | Owner 建議 | 依賴             |
| ------ | --------------------------------- | ---------- | ---------------- |
| WD-001 | Booking wizard — API 完整接通     | Codex      | W8-001C, W8-001D |
| WD-002 | Booking list + detail             | Qwen       | W8-001C          |
| WD-003 | Passengers & Address Book         | Qwen       | W8-001D          |
| WD-004 | Reports — 下載與 export           | Gemini     | W5-001A          |
| WD-005 | API Keys & Webhooks               | Codex      | W7-001C, W8-001D |
| WD-006 | Billing & Invoicing               | Gemini     | W4-001A          |
| WD-007 | Notifications & SLA               | Qwen       | W3-001B          |
| WD-008 | Tenant Admin, Roles & Audit Trail | Codex      | W7-001B, W8-001D |

**強制工程規範（全 Wave D 任務）：**

- 所有頁面依賴 `@drts/contracts` 的 type，禁止自行定義 schema
- 所有 API 呼叫走 `@drts/api-client`
- 不在前端 repo 建立 domain authority

### Wave E — Staging Pipeline（P1）

| ID     | 標題                                              | Owner 建議 | 依賴         |
| ------ | ------------------------------------------------- | ---------- | ------------ |
| WE-001 | GitHub Actions CI — lint / typecheck / test       | Gemini     | all Wave A-C |
| WE-002 | Docker multi-stage build（api + web apps）        | Gemini     | WE-001       |
| WE-003 | GCP staging deploy config                         | Gemini     | WE-001       |
| WE-004 | Smoke test suite（API + UI critical paths）       | Codex      | WE-001       |
| WE-005 | UAT scenario pack（Phase 1 acceptance scenarios） | Claude     | WE-001       |

執行時依賴重切原則：

- `WE-003` 可先完成 deploy scaffold、secret wiring 與 migration flow，待 `WE-002` image 輸出穩定後再接 image reference。
- `WE-004` 可先完成 smoke harness、fixtures 與 critical-path 腳本，待 staging config ready 後再做環境接線與實跑。
- `WE-005` 可先完成 UAT 場景草稿、角色路徑與 checklist，待 smoke evidence 齊備後再收尾 acceptance evidence mapping。

---

## 4. 關鍵邊界規則（Supervisor 執行時須強制）

### 4.1 Driver App 邊界

- **允許：** display forwarded tasks、sync status to platform、aggregate earnings
- **禁止：** 覆寫第三方平台派遣規則、自定 route/waypoint、把 forwarded 任務當成 owned 任務處理

### 4.2 tenant-commute-hub 邊界

- **允許：** 呼叫 core repo BFF/API、使用 core contracts/SDK
- **禁止：** 自行維護 domain enums、自定 webhook/billing/audit 規則、直接寫死 API payload 而非走 contracts、tenant portal 頁面顯示 platform-level 管控功能

### 4.3 Platform Admin 邊界

- **允許：** 管理 tenant、fleet、switchboard、pricing、payments、audit、feature flags
- **禁止：** 顯示 ROC 前線操作介面、forwarder 管理（屬 ops 領域）

### 4.4 Ops Console 邊界

- **允許：** dispatch scheduling、callcenter、complaint、incident、maintenance、reports
- **禁止：** tenant 治理、pricing/billing 配置

---

## 5. Phase 1 DoD 對照（gap 文件 Section 9）

| 條件                                                | 對應 Wave       | 目前狀態                   |
| --------------------------------------------------- | --------------- | -------------------------- |
| core repo 有完整 domain authority                   | Wave A          | 後端完成，前端 placeholder |
| tenant portal 只保留前端責任                        | Wave A + WA-005 | boundary 未文件化          |
| Platform Admin 可做真正平台治理                     | Wave B (WB-001) | Placeholder                |
| Ops Console 可做真正派遣排班                        | Wave B (WB-002) | 部分 API 接通，無操作      |
| Driver App 支援多平台任務整合、平台上下線、平台收益 | Wave A + C      | 未實作                     |
| forwarded 任務不覆寫第三方規則                      | Wave A (WA-004) | 未實作                     |
| staging 可部署                                      | Wave E          | 未建立                     |
| 主要 UAT 場景可驗                                   | Wave E          | 部分 runbook 存在          |

---

## 6. Supervisor 進入 Planning Mode 的建議指令

```
執行模式：supervisor_managed_execution
下一輪起點：Wave A（WA-001 + WA-002 可平行啟動）
平行可啟動：WA-001（Codex）、WA-002（Codex）同時開始
阻擋關係：
  WA-003 需等 WA-001 + WA-002
  WA-004 需等 WA-003
  WB-001、WB-002、WB-003 可在 WA-005 完成後平行啟動
  Wave C 全部等 Wave A 完成
  Wave D 等 Wave A + Wave B 完成
  Wave E 等 Wave A-D 完成

新增任務前須先更新 ai-status.json，每個任務需有：
  - task_id (WA-001 格式)
  - owner + reviewer（不得相同）
  - depends_on（精確 task_id 列表）
  - summary_zh
  - acceptance criteria
```

---

## 7. 待 supervisor 決定事項

1. **WA-003 vs WC-001~005 的切法** — 是一個大任務「Driver App multi-platform overhaul」還是分成 WA（後端基礎）+ WC（完整功能）兩個 wave？建議維持文件提案：WA 先做後端 + 最小 UI 重定向，WC 做完整功能。

2. **tenant-commute-hub 的執行方式** — 該 repo 尚未進行 code-level audit，Wave D 任務是否在 `drts-fleet-platform` 中驅動，或另起 planning session？建議：boundary document 在 core repo，實際 frontend 實作任務等 repo 可讀後另開。

3. **Wave B WB-001 Platform Admin Web 的優先子集** — 整個 control plane 很大，是否先做 tenants + feature flags + audit（最高商業價值），其餘列為 P2？建議：第一批做 tenants、feature-flags、audit，第二批做 fleet、pricing、payments。

4. **platform_presence / platform_earnings 的 DB schema** — 需要確認是否列入 V001x migration sequence，或獨立 migration pack？建議：進入 migration sequence（V0014+）。

---

_此文件為 planning brief，非 canonical source of truth。採納後須將工作包寫入 `ai-status.json`。_
