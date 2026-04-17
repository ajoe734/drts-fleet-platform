# Phase 2 Gap Reassessment — Starter Draft

**Workspace:** `docs/02-architecture/consensus/phase2-gap-reassessment-20260415/`  
**Starter:** Codex  
**Supervisor:** Claude  
**Review order:** Qwen → Gemini → Copilot → Claude  
**Created:** 2026-04-15  
**Primary source:** `phase1_dual_repo_gap_analysis_for_dev_team_final.md`

---

## 0. 目的

本輪 planning 不是重做 Wave A–E，也不是重複舊的 `phase2-planning` starter。
目標是重新校準三件事：

1. 目前 `drts-fleet-platform` 真正已完成到哪裡
2. 與 `phase1_dual_repo_gap_analysis_for_dev_team_final.md` 以及 Phase 1 正式藍圖相比，還缺什麼
3. 哪些缺口屬於本 repo 可直接做、哪些屬於外部 repo / rollout evidence / human gate

---

## 1. 機器真相快照（2026-04-15）

### 1.1 官方 task board 狀態

- `ai-status.json` 顯示目前 `35` 個 task 全部 closed，`open = 0`
- `current-work.md` 顯示 Wave A–E 全數 `done`
- 目前 repo 沒有新的 implementation backlog，仍停留在舊的 `phase2-planning` workspace

### 1.2 control-plane 狀態漂移

- `ai-status.json` 目前仍標示 `discussion_planning`
- 但 live supervisor state 仍停在 `focus_mode = execution`
- 代表 planning / runtime control plane 存在一次 reset 漂移，這本身就是本輪 planning 的 housekeeping 項目

### 1.3 舊 `phase2-planning` starter 已過時

舊稿把下面幾件事當成「仍待完成」：

- Driver App 多平台化
- `/api/tenant/*` 大面積補齊
- Ops dispatch board 從列表頁升級
- Wave E CI / Docker / staging / smoke / UAT 資產

但依目前 repo 實作與 task board，這些項目大多已被 Wave A–E 實作或至少起草完成，因此舊稿已不適合作為本輪 planning baseline。

---

## 2. 對照正式藍圖後的現況盤點

### 2.1 已明顯對齊的部分

#### A. core repo 的 canonical backend 方向已成形

`phase1_dual_repo_gap_analysis_for_dev_team_final.md` 對 Repo A 的總判讀仍成立：

- `drts-fleet-platform` 不需要推倒重來
- 它已是厚 backend / contracts / modules 的主體 repo
- 問題已不再是「做不出來」，而是「哪些控制面和跨 repo 收尾還沒結束」

#### B. Driver App 已大幅向多平台工作台收斂

實作證據：

- `apps/driver-app/app/jobs.tsx`
- `apps/driver-app/app/platform-presence.tsx`
- `apps/driver-app/components/platform-binding.tsx`
- `apps/driver-app/components/earnings-by-platform.tsx`
- `apps/api/src/modules/platform-presence/`
- `apps/api/src/modules/platform-earnings/`

這表示 final gap analysis 中關於「必須補 platform source / online-offline / earnings aggregation / route locked」的方向，大部分已在 core repo 內落地。

#### C. Tenant Portal 的 canonical consumer 版本已在 core repo 補齊大部分頁面

實作證據：

- `apps/tenant-portal-web/app/bookings/new/page.tsx`
- `apps/tenant-portal-web/app/booking-list/`
- `apps/tenant-portal-web/app/passengers/page.tsx`
- `apps/tenant-portal-web/app/addresses/page.tsx`
- `apps/tenant-portal-web/app/reports/page.tsx`
- `apps/tenant-portal-web/app/api-keys/page.tsx`
- `apps/tenant-portal-web/app/webhooks/page.tsx`
- `apps/tenant-portal-web/app/billing/page.tsx`
- `apps/tenant-portal-web/app/notifications/page.tsx`
- `apps/tenant-portal-web/app/sla/page.tsx`
- `apps/tenant-portal-web/app/users/page.tsx`
- `apps/tenant-portal-web/app/audit/page.tsx`

搭配 `apps/api/src/modules/tenant-partner/tenant-partner.controller.ts`，
core repo 內的 `/api/tenant/*` consumer path 已不再是空白。

#### D. Ops dispatch board 已不再只是 38 行列表頁

實作證據：

- `apps/ops-console-web/app/dispatch/page.tsx`
- `apps/ops-console-web/app/dispatch/dispatch-workflow.tsx`
- `apps/api/src/modules/owned-mobility/owned-mobility.controller.ts`

目前已具備：

- 待派 / reserved / exception queue summary
- dispatch job 顯示
- candidate fetch
- assign / redispatch / release flow
- ETA 顯示

因此 final gap analysis 裡「dispatch board 過薄」的診斷方向正確，但現況已經比文件描述前進一大截。

---

## 3. 仍不足或只完成一半的部分

### 3.1 Platform Admin 仍是本 repo 最明顯的完成度缺口

雖然 `apps/platform-admin-web/` 頁面骨架已存在，且首頁已列出：

- tenants
- users
- fleet
- switchboard
- pricing
- payments
- health
- audit
- feature flags

但 API authority 仍明顯偏薄：

- `apps/api/src/modules/platform-admin/platform-admin.controller.ts`
  目前只覆蓋 `public-info` 與 `placards`
- `apps/api/src/modules/platform-admin/tenants.controller.ts`
  目前只覆蓋 `tenants`

也就是說，Platform Admin 的 **UI 覆蓋率高於平台專屬 backend authority**。
目前多個頁面仍有以下狀況：

- 借用 shared endpoint，而不是 platform-specific control-plane API
- quota 區塊使用模擬資料
- feature flags 客戶端呼叫 `/api/admin/flags`，但 rollout runbook 已明寫該 controller 尚未完成

### 3.2 Ops Console 已有 dispatch 控制台，但整體營運控制面仍未完全補齊

`apps/ops-console-web/` 已有：

- dashboard
- dispatch
- incidents
- complaints
- reports
- vehicles
- drivers
- attendance
- maintenance
- callcenter

但本輪需要確認的不是「頁面有沒有」，而是：

- 哪些頁面有真資料與真操作
- 哪些頁面仍停在 UI shell / table view / partial integration
- 是否已符合 PRD 內 Host / OpCo / ROC 控制面的 breadth

### 3.3 Rollout / smoke / UAT / e2e 多數停在文件與骨架，仍缺正式 evidence

目前這一層的狀態是：

- `docs/03-runbooks/phase1-rollout.md` 已存在
- `docs/04-uat/phase1-uat-scenarios.md` 已存在
- `docs/04-uat/phase1-uat-checklist.md` 已存在

但 checklist 仍明寫：

- `Status: Draft — pending smoke evidence from WE-004`
- staging / Docker image / migrations / seed data / UAT sign-off 多數尚未打勾

換句話說，**Wave E 交付的是 rollout pack 與檢核骨架，不是已完成的 staging/UAT 實績**。

### 3.4 `tenant-commute-hub` 的實際 authority 移除仍屬外部 repo 缺口

這個 repo 已有：

- `docs/02-architecture/authority/rgp-002-authority-map.md`
- `docs/02-architecture/tenant-commute-hub-boundary.md`

表示邊界與 SoT 已被宣告清楚。

但目前 workspace 裡 **沒有 `tenant-commute-hub` 原始碼**，因此本 repo 能確認的是：

- boundary contract 已定
- core consumer surfaces 已補

本 repo 目前不能直接確認的是：

- `tenant-commute-hub` 是否真的移除了 Supabase authority
- Lovable repo 是否已改接 `/api/tenant/*`
- repo B 的 dashboard / summary / settings 是否仍含 demo or hardcoded truth

因此 final gap analysis 中最重要的 `dual truth` 警告，仍屬有效且尚未在 code level 被關閉。

---

## 4. 對 `phase1_dual_repo_gap_analysis_for_dev_team_final.md` 的重判讀

### 4.1 這份 final gap analysis 仍然正確的地方

- repo A 應作為 canonical backend / BFF / contracts / admin / ops / driver 主線
- repo B 不應承擔 tenant authority
- Driver App 不能繼續朝單一自家中央派遣執行器發散
- Platform Admin / Ops Console 必須是 control plane，而不是只有 UI shell

### 4.2 這份 final gap analysis 已經落後目前 repo 真相的地方

以下項目不能再被視為「幾乎未做」：

- Driver App 多平台 domain 與 UI
- tenant consumer surfaces in core repo
- dispatch board 升級
- rollout/UAT 文檔資產

### 4.3 因此本輪 planning 不應照單全收舊的 P2-A 到 P2-I

新 planning 應改成：

1. 把已完成項目從 backlog 中移除
2. 把「部分完成」改寫成 narrower finish tasks
3. 把跨 repo annex、staging evidence、dual-repo completion gate 獨立列成新工作

---

## 5. 建議的缺口分類

### Bucket A — 已完成，可作為新 baseline

- core repo multi-platform driver foundation
- core repo tenant consumer portal baseline
- core repo dispatch workflow baseline
- rollout / UAT artifact packs
- cross-repo authority boundary文檔

### Bucket B — 部分完成，需在本 repo 繼續收尾

- Platform Admin authority parity
- Ops Console breadth parity
- rollout evidence / staging / smoke / UAT execution evidence

### Bucket C — 外部 repo / cross-repo 阻塞

- `tenant-commute-hub` authority annex audit
- Lovable repo cutover spec / migration waves
- dual-repo happy-path E2E in integrated environment

### Bucket D — 治理與文件真相修正

- 重設 active planning workspace
- 清理舊 `phase2-planning` 中已過時的未完成敘述
- 對齊 supervisor runtime mode 與 `ai-status.json`

---

## 6. 建議 next-wave 計畫

### P0 — 真相重基線與 cross-repo 準備

- `P2R-001` 重新建立 dual-repo current-state gap report，將已完成 / 部分完成 / blocked 分開
- `P2R-002` 對 `tenant-commute-hub` 啟動 annex audit，逐頁確認 authority、data source、Supabase 殘留
- `P2R-003` 產出 `tenant-commute-hub` cutover spec v2，將 repo B 的頁面對映到 core `/api/tenant/*`

### P1 — 本 repo 控制面補齊

- `P2R-004` Platform Admin authority completion
- `P2R-005` Ops Console breadth completion

### P2 — 驗證與交付證據

- `P2R-006` staging / smoke / UAT evidence closeout
- `P2R-007` cross-repo happy-path + audit/billing consistency suite
- `P2R-008` dual-repo completion gate 與 rollout decision pack

---

## 7. 提請 reviewer 聚焦回答的問題

1. Platform Admin 最大缺口應優先定義成「平台專屬 backend authority 不足」，還是「前後端一起不足」？
2. `tenant-commute-hub` annex audit 在拿到 repo B 前，是否只能作為 blocked planning item，還是可以先產出頁面級 cutover spec 並提早拆 task？
3. rollout/UAT/staging evidence 是否應單獨成 wave，而不與 cross-repo cutover 混做？
4. 是否需要把舊 `phase2-planning` 直接標記為 superseded，避免 dashboard / onboarding 再把舊結論當現況？
