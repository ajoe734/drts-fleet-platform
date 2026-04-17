# Full Blueprint Planning — Starter Draft

**Workspace:** `docs/02-architecture/consensus/phase2-full-blueprint-planning-20260415/`  
**Starter:** Codex  
**Supervisor:** Claude  
**Review order:** Qwen → Gemini → Copilot → Claude  
**Created:** 2026-04-15  
**Primary source bundle:** `phase1_prd_detailed_v1.md`, `phase1_service_contracts_v1.md`, `TARGET_ARCHITECTURE.md`, `ROADMAP.md`, `DEVELOPMENT_WORKBREAKDOWN.md`, `phase1_dual_repo_gap_analysis_for_dev_team_final.md`

---

## 0. 本輪 planning 的改變

本輪不再只討論「目前剩下的幾個 gap」。

本輪的正式目標是：

> **把完整 blueprint 的所有 scope 一次放進 planning mode，形成全量 scope inventory 與完整開發計畫。**

也就是：

- 不只列目前 repo 中還沒收尾的項目
- 也要把 blueprint 裡已完成、部分完成、尚未落地、外部 repo 阻塞、以及未來 gated scope 一次列清楚

---

## 1. 全量藍圖 scope baseline

依 `phase1_prd_detailed_v1.md`，本輪至少必須盤入以下 blueprint scope。

### 1.1 Intake / entry surfaces

- Passenger App / Web
- Business / Partner Portal
- Call Point / Concierge Portal
- Call Center / CTI Console
- Complaint Hotline Console

### 1.2 Core backend engines / domains

- Product Mapping Engine
- Contract / SLA Engine
- Central Order Router
- ETA Engine
- Realtime Matcher
- Reservation Scheduler
- Queue / Rank Manager
- Qualification Engine
- Forwarder Hub

### 1.3 Driver App

- Jobs Inbox
- Job Detail & Go-to-Pickup
- Drive Console
- SOS & Incident
- Handover & Proof
- Shift & Attendance
- Earnings & Wallet
- Settings & Academy

### 1.4 Ops / Host / OpCo / ROC backend surfaces

- Dashboard
- Dispatch Scheduling
- Revenue Management
- Maintenance Logs
- Incident Reporting
- Reports Center

### 1.5 Compliance / regulatory domains

- Vehicle Regulatory Registry
- Driver Regulatory Registry
- Contract Registry
- Insurance Registry
- Dispatch Exclusivity Control
- Branding / Placard Registry

### 1.6 Call / complaint / trace domains

- Telephony & Recording
- Dispatch Trace
- Complaint Case Center

### 1.7 Financial domains

- Passenger Billing
- Tenant Billing & Invoicing
- Driver Service Fee Billing
- Driver Reimbursement

### 1.8 Public disclosure / filing domains

- Public Info CMS
- Seat-back Placard Generator
- Regulatory Reports
- Filing Package

### 1.9 Cross-cutting rollout scope

- staging deploy
- smoke verification
- UAT execution
- evidence capture
- rollout decision gates

### 1.10 Cross-repo / repo-topology scope

- `drts-fleet-platform` as canonical backend / contracts / control-plane repo
- `tenant-commute-hub` as external tenant-portal UI repo
- any missing repo landing zones for blueprint surfaces that are defined in PRD but not yet present in the monorepo

### 1.11 Future-gated blueprint scope that still belongs in the master plan

- `av_pilot`
- Tesla integration admin
- ODD rules runtime
- ROC live board
- evidence bundle / AV expansion hooks

---

## 2. 目前 repo 真相（full-scope 視角）

### 2.1 已落地的 backend domain landing zones

`apps/api/src/modules/` 目前已存在：

- identity
- tenant-partner
- regulatory-registry
- product-rule
- owned-mobility
- forwarder
- billing-settlement
- reporting-filing
- audit-notification
- callcenter
- complaint
- incident
- maintenance
- shift-attendance
- driver-settings
- feature-flags
- platform-admin
- platform-presence
- platform-earnings

這表示 blueprint domain 層不是空白，而是已經有相當完整的 monorepo landing zones。

### 2.2 已存在的前端 / operator surfaces

目前 monorepo 內存在：

- `apps/tenant-portal-web`
- `apps/platform-admin-web`
- `apps/ops-console-web`
- `apps/driver-app`

也就是 blueprint 中的四個主要既有骨架都已在 repo 內。

### 2.3 Tenant Portal topology 的隱藏衝突已被人類定案

目前實際上同時存在兩套 tenant portal：

- `apps/tenant-portal-web/`（`drts-fleet-platform` 內部 Wave D 產物）
- `tenant-commute-hub`（外部 Lovable repo，仍殘留 Supabase authority）

本輪 human decision 已明確指定：

- **保留 `tenant-commute-hub` 作為唯一 tenant portal UI repo**
- **`apps/tenant-portal-web/` 不再作為正式產品路線，改列 retire / decommission 路線**
- **後端 authority 一律由 `drts-fleet-platform` 提供**
- **repo B 必須刪除 Supabase 與其他自帶 backend authority，改為消費 `drts-fleet-platform` 提供的 BFF / `/api/tenant/*`**

因此，這不再是開放式 topology 問題，而是已知方向：

> `tenant-commute-hub` = 唯一 tenant portal UI  
> `drts-fleet-platform` = tenant portal backend / BFF / contracts / authority  
> `apps/tenant-portal-web` = retire target, not long-term production surface

### 2.4 明確不存在或未見獨立 landing zone 的 blueprint surfaces

至少以下 scope 目前沒有明確獨立 app landing zone：

- Passenger App / Web
- Call Point / Concierge Portal
- 獨立的 Complaint Hotline Console app

這些即使今天不立刻進 execution，也必須被記入 full-scope planning，而不是被自動忽略。

---

## 3. full-scope 判讀

### 3.1 不能再把 planning 只縮成幾個 repo gap

前一輪較窄的 planning，雖然有價值，但它主要聚焦：

- repo A / repo B dual truth
- Platform Admin authority
- Ops Console breadth
- rollout evidence

這對“目前剩餘缺口”是合理的，但對“完整藍圖”是不夠的。

因為完整藍圖還包含：

- Passenger / Concierge / Call Point 等前端 surface 是否要落在哪個 repo
- Call Center / CTI / Dispatch Trace / Complaint Hotline 的完整 operator topology
- Driver reimbursement / fee plan / regulatory filing 等完整 finance-compliance scope
- Public Info / Placard / Filing Package 的 end-to-end completion
- future-gated blueprint scope 的正式歸檔與波次安排

### 3.2 因此本輪 planning 輸出必須是 master plan，不只是 narrow gap plan

新輸出需要同時回答：

1. 哪些 blueprint scope 已完成
2. 哪些只是 baseline 完成，但離 blueprint completion 還有距離
3. 哪些完全缺席
4. 哪些是 repo topology / external dependency 問題
5. 哪些是 future-gated，不該假裝不存在

---

## 4. 目前初判

### 4.1 已有高完成度 baseline

- canonical backend landing zones
- tenant-partner consumer baseline
- owned mobility / dispatch / forwarder baseline
- driver multi-platform baseline
- billing / reporting / audit landing zones
- rollout/UAT artifact documents

### 4.2 仍是明顯部分完成

- Platform Admin full control-plane parity
- Ops Console full operator breadth
- Callcenter / complaint / trace end-to-end operational completeness
- rollout evidence and real sign-off
- dual-repo closeout

### 4.3 明顯缺席或至少沒有清楚 landing zone

- Passenger App / Web
- Call Point / Concierge Portal
- blueprint 級的 dedicated hotline/concierge operator topology

### 4.4 blocked external / cross-repo

- `tenant-commute-hub` BFF cutover 與 authority deletion
- repo B page-by-page cutover
- integrated dual-repo happy path
- `apps/tenant-portal-web` decommission sequencing

### 4.5 future-gated but must stay in plan

- AV / ODD / Tesla / ROC live-board extensions

---

## 5. 建議將 full blueprint 拆成五層計畫

### Layer A — Implemented baseline freeze

目標：把已完成 baseline 正式凍結成新起點，避免後續 planning 再把已完成項目當未完成。

### Layer B — Phase 1 blueprint completion

目標：把已存在但仍不夠完整的四大主線補齊：

- Platform Admin
- Ops / Host / OpCo / ROC
- finance / compliance completion
- rollout evidence

### Layer C — Missing blueprint surfaces

目標：對 Passenger App / Concierge / Call Point / hotline console 類缺席 surface 做 landing-zone 與 repo topology 決策，再決定是否建立新 app 或掛入既有 surface。

### Layer D — Cross-repo convergence

目標：完成 `tenant-commute-hub` 以 BFF 為中心的 cutover、移除 Supabase authority、退役 `apps/tenant-portal-web`、以及 dual-repo evidence / completion gate。

### Layer E — Future-gated blueprint roadmap

目標：把 AV / ODD / Tesla / ROC live-board 等 scope 明確掛到後續波次，而不是留在灰色地帶。

---

## 6. 建議 next-wave 任務家族

### Governance / Planning

- `FBP-001` Full blueprint scope matrix
- `FBP-002` Supersede stale planning baselines and freeze implemented baseline
- `FBP-003` Repo topology decision pack for missing blueprint surfaces
- `FBP-004` Tenant portal topology decision capture and dual-repo cutover master spec

### Tenant Portal convergence

- `FBP-005` `drts-fleet-platform` tenant BFF parity and contract authority
- `FBP-006` `tenant-commute-hub` cutover to BFF + delete Supabase/backend authority
- `FBP-007` retire / decommission `apps/tenant-portal-web`

### Core completion execution candidates

- `FBP-008` Platform Admin blueprint completion
- `FBP-009` Ops / Host / OpCo / ROC blueprint completion
- `FBP-010` Callcenter / complaint / dispatch trace completion
- `FBP-011` Finance / billing / reimbursement / filing completion
- `FBP-012` Public info / placard / regulatory report completion
- `FBP-013` rollout evidence / staging / smoke / UAT completion
- `FBP-014` integrated cross-surface and cross-repo E2E suite

### Future-gated roadmap items

- `FBP-015` AV / ODD / ROC / Tesla deferred roadmap packet

---

## 7. 請 reviewer 聚焦回答

1. 在 tenant portal 已定案為 `tenant-commute-hub` 唯一 UI 的前提下，`apps/tenant-portal-web` 應採立即凍結後退役，還是先保留為短期 reference shell？
2. Platform Admin / Ops / Callcenter / Complaint / Finance / Filing 這幾大塊，哪一塊最應先做完整 blueprint completion wave？
3. Passenger App / Web 與 Call Point / Concierge Portal 是否要正式納入 master plan，即使當前 repo 沒有 landing zone？
4. future-gated scope 是否要直接放進 master plan 的 deferred lane，而不是只留在 PRD 尾段文字？
